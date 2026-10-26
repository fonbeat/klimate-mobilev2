import { createContext, useContext, type PropsWithChildren } from 'react';
import { useApiData } from './use-api';
import type { OrganizationModules } from './types';

const CapabilitiesContext = createContext({ loading: true, servicesEnabled: true, reload: async () => {} });

export function CapabilitiesProvider({ children }: PropsWithChildren) {
  const modules = useApiData<OrganizationModules>('/v2/modules');
  // Unknown capability information falls back to the API's explicit permission response.
  const service = modules.data?.modules.find((item) => item.key === 'business_service');
  return <CapabilitiesContext.Provider value={{ loading: modules.loading, servicesEnabled: !service || (service.enabled && service.available), reload: modules.refreshBackground }}>{children}</CapabilitiesContext.Provider>;
}

export const useCapabilities = () => useContext(CapabilitiesContext);
