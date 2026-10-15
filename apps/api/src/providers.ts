export type IdentityStart = {
  providerRef: string;
  status: "pending" | "verified" | "failed";
};

export interface IdentityProvider {
  readonly name: string;
  start(input: { legalName: string; idNumber: string; phone: string; method: "three_factor" | "offline" }): Promise<IdentityStart>;
}

export interface EsignProvider {
  readonly name: string;
  createFlow(input: { contractId: string; title: string; signerName: string }): Promise<{ providerContractId: string }>;
}

export interface EmailProvider {
  readonly name: string;
  send(input: { to: string; subject: string; body: string; attachmentSha256: string | null }): Promise<{ providerMessageId: string }>;
}

export function getIdentityProvider(): IdentityProvider {
  return {
    name: "mock-identity",
    async start(input) {
      const formatOk = /^\d{17}[\dXx]$/.test(input.idNumber) && /^1\d{10}$/.test(input.phone) && input.legalName.trim().length >= 2;
      return {
        providerRef: `MOCK-ID-${crypto.randomUUID()}`,
        status: formatOk ? "verified" : "failed",
      };
    },
  };
}

export function getEsignProvider(): EsignProvider {
  return {
    name: "mock-esign",
    async createFlow() {
      return { providerContractId: `MOCK-CT-${crypto.randomUUID()}` };
    },
  };
}

export function getEmailProvider(): EmailProvider {
  return {
    name: "mock-email",
    async send() {
      return { providerMessageId: `<${crypto.randomUUID()}@mock.guoxie.local>` };
    },
  };
}
