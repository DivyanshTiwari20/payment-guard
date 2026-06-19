// dist/engine/policy-engine.js
function normalizePayee(payee) {
  return payee.toLowerCase().trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function isPolicyExpired(policy, now = /* @__PURE__ */ new Date()) {
  if (policy.expiresOn === null)
    return false;
  const expiry = Date.parse(policy.expiresOn);
  if (Number.isNaN(expiry))
    return true;
  return now.getTime() > expiry;
}
function evaluatePayment(request, policy, spentToday, now = /* @__PURE__ */ new Date()) {
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    return { allowed: false, reason: "Amount must be a finite number greater than zero." };
  }
  if (isPolicyExpired(policy, now)) {
    return { allowed: false, reason: `Policy expired on ${policy.expiresOn}.` };
  }
  if (request.amount > policy.maxAmount) {
    return {
      allowed: false,
      reason: `Amount ${request.amount} exceeds the per-payment limit of ${policy.maxAmount}.`
    };
  }
  if (policy.allowedPayees.length > 0) {
    const normalizedRequest = normalizePayee(request.payee);
    const allowed = policy.allowedPayees.some((p) => normalizePayee(p) === normalizedRequest);
    if (!allowed) {
      return {
        allowed: false,
        reason: `Payee "${request.payee}" is not on the global allowlist.`
      };
    }
  }
  if (spentToday + request.amount > policy.dailyLimit) {
    return {
      allowed: false,
      reason: `This payment would cross the daily limit of ${policy.dailyLimit} (already spent ${spentToday}).`
    };
  }
  return { allowed: true, reason: "All global policy checks passed." };
}

// dist/engine/mandate-engine.js
function mandateStatus(mandate, now = /* @__PURE__ */ new Date()) {
  if (mandate.revoked)
    return "revoked";
  const expiry = Date.parse(mandate.expiresAt);
  if (Number.isNaN(expiry) || now.getTime() >= expiry)
    return "expired";
  if (mandate.spent >= mandate.totalBudget)
    return "exhausted";
  return "active";
}
function remainingBudget(mandate) {
  return Math.max(0, mandate.totalBudget - mandate.spent);
}
function findActiveMandates(mandates, normalizedPayee, now = /* @__PURE__ */ new Date()) {
  return mandates.filter((m) => m.payee === normalizedPayee && mandateStatus(m, now) === "active");
}
function evaluateMandate(mandate, request) {
  if (request.amount > mandate.maxAmount) {
    return {
      allowed: false,
      reason: `Amount ${request.amount} exceeds the mandate's per-transaction limit of ${mandate.maxAmount}.`
    };
  }
  const remaining = remainingBudget(mandate);
  if (request.amount > remaining) {
    return {
      allowed: false,
      reason: `Amount ${request.amount} exceeds the mandate's remaining budget of ${remaining}.`
    };
  }
  return { allowed: true, reason: `Authorized under mandate ${mandate.id}.` };
}
function selectMandate(activeMandates, request) {
  if (activeMandates.length === 0) {
    return {
      mandate: null,
      decision: { allowed: false, reason: "No active mandate for this payee." }
    };
  }
  for (const mandate of activeMandates) {
    const decision = evaluateMandate(mandate, request);
    if (decision.allowed) {
      return { mandate, decision };
    }
  }
  const best = activeMandates.reduce((a, b) => remainingBudget(b) > remainingBudget(a) ? b : a);
  return { mandate: null, decision: evaluateMandate(best, request) };
}

// dist/engine/validators.js
var MAX_PAYEE_LENGTH = 100;
var URL_PATTERN = /(https?:\/\/|www\.)/i;
var CODE_PATTERN = /[{}<>;`]/;
function hasAtMostTwoDecimals(amount) {
  const cents = amount * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-9;
}
function validateRequest(request) {
  const { payee, amount } = request;
  if (typeof payee !== "string" || payee.trim().length === 0) {
    return { allowed: false, reason: "Payee must be a non-empty string." };
  }
  if (payee.length > MAX_PAYEE_LENGTH) {
    return {
      allowed: false,
      reason: `Payee name is too long (max ${MAX_PAYEE_LENGTH} characters).`
    };
  }
  if (URL_PATTERN.test(payee)) {
    return {
      allowed: false,
      reason: "Payee name must not contain a URL."
    };
  }
  if (CODE_PATTERN.test(payee)) {
    return {
      allowed: false,
      reason: "Payee name contains disallowed characters ({ } < > ; `)."
    };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return {
      allowed: false,
      reason: "Amount must be a finite number greater than zero."
    };
  }
  if (!hasAtMostTwoDecimals(amount)) {
    return {
      allowed: false,
      reason: "Amount must have at most two decimal places."
    };
  }
  return { allowed: true, reason: "Input validation passed." };
}

// dist/engine/decide.js
function decidePayment(request, ctx) {
  const { policy, mandates, spentToday, now = /* @__PURE__ */ new Date() } = ctx;
  const block = (decision2, mandateId = null) => ({
    decision: decision2,
    mandateId,
    newSpentToday: spentToday,
    mandateRemaining: null
  });
  const validation = validateRequest(request);
  if (!validation.allowed)
    return block(validation);
  const normalizedPayee = normalizePayee(request.payee);
  const active = findActiveMandates(mandates, normalizedPayee, now);
  const { mandate, decision: mandateDecision } = selectMandate(active, request);
  if (!mandate)
    return block(mandateDecision);
  const policyDecision = evaluatePayment(request, policy, spentToday, now);
  if (!policyDecision.allowed)
    return block(policyDecision, mandate.id);
  const decision = {
    allowed: true,
    reason: `Payment of ${request.amount} to "${request.payee}" approved under mandate ${mandate.id} (${mandate.purpose}).`
  };
  return {
    decision,
    mandateId: mandate.id,
    newSpentToday: spentToday + request.amount,
    mandateRemaining: remainingBudget(mandate) - request.amount
  };
}
export {
  decidePayment,
  mandateStatus,
  normalizePayee,
  remainingBudget
};
