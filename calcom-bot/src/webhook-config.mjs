export const WEBHOOK_ENVIRONMENTS = {
  test: {
    id: "test",
    label: "Teste",
    url: "https://n8n-n8n.x3fc7o.easypanel.host/webhook/4e97c046-a3a7-4b1f-91ed-48804d61d656sdlknfd",
  },
  production: {
    id: "production",
    label: "Produção",
    url: "https://n8n-n8n.x3fc7o.easypanel.host/webhook/6c5934d6-008f-48b4-8bc2-a8d037c459f6soisdjsdfsdf",
  },
};

export function listWebhookEnvironments() {
  return Object.values(WEBHOOK_ENVIRONMENTS);
}

export function resolveWebhookUrl(environment, customUrl) {
  if (customUrl?.trim()) return customUrl.trim();
  const key =
    environment === "production" || environment === "prod"
      ? "production"
      : "test";
  return WEBHOOK_ENVIRONMENTS[key]?.url || WEBHOOK_ENVIRONMENTS.test.url;
}
