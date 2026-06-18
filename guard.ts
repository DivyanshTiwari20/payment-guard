import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "payment-guard",
  version: "1.0.0",
});

type Policy = {
    maxAmount : number;
    allowedPayees : string[];
    dailyLimit : number;

};

type PaymentRequest = {
    payee: string;
    amount : number;
};

type Decision = {
    allowed : boolean;
    reason : string;
};

let  spendToday = 0;

function evaluatePayment( request : PaymentRequest, policy: Policy): Decision{
    if (request.amount <=0){
        return {allowed:false, reason: "Amount must be greater than zero."};
    }
    if (request.amount > policy.maxAmount){
        return {allowed: false, reason : `over per-payment limit of ${policy.maxAmount}rs`};
    }
    if (!policy.allowedPayees.includes(request.payee)){
        return {allowed:false, reason:`payee "${request.payee}" isn't allowed`};
    }
    if (spendToday + request.amount > policy.dailyLimit){
        return {allowed: false, reason: `would cross daily limit of ${policy.dailyLimit}rs `};
    }

    return { allowed: true, reason: "all checks passed"};
    
}

function handlePayment(request: PaymentRequest, policy: Policy): Decision {
    const decision = evaluatePayment(request, policy);

    if (decision.allowed) {
        spendToday += request.amount;
        console.log(`✅ Paid ₹${request.amount} to ${request.payee}. (Spent today: ₹${spendToday})`);
    } else {
        console.log(`❌ Blocked: ${decision.reason}`);
    }

    return decision;
}
const myPolicy : Policy = {
    maxAmount: 2000,
    allowedPayees: ['electricity-board', 'landlord', 'amazon'],
    dailyLimit : 5000
};
  
server.registerTool(
  "make_payment",
  {
    description: "Check a payment request against the user's spending policy and process it if allowed.",
    inputSchema: {
      payee: z.string(),
      amount: z.number(),
    },
  },
  async ({ payee, amount }) => {
    const decision = handlePayment({ payee, amount }, myPolicy);
    return {
      content: [{ type: "text", text: JSON.stringify(decision) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);