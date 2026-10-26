export type ServiceComponentDefinition = {
  indicators: unknown[];
  dependencies: unknown[];
  redundancyGroups: { members: unknown[] }[];
};

export function serviceComponentCounts(definition: ServiceComponentDefinition) {
  return {
    indicators: definition.indicators.length,
    dependencies: definition.dependencies.length + definition.redundancyGroups.reduce((total, group) => total + group.members.length, 0),
  };
}
