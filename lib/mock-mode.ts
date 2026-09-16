export const MOCK_ENVIRONMENT_ID = "mock-demo";

export function isMockMode(): boolean {
  return process.env.NODE_ENV === "development" && process.env.PULSELOG_MOCK === "true";
}
