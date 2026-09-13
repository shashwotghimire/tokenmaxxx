export function selectRootRoute<T>(
  dashboardEnabled: boolean,
  routes: { landing: T; dashboard: T },
): T {
  return dashboardEnabled ? routes.dashboard : routes.landing;
}
