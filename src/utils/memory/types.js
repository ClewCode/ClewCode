import { feature } from 'bun:bundle';
export const MEMORY_TYPE_VALUES = [
    'User',
    'Project',
    'Local',
    'Managed',
    'AutoMem',
    ...(feature('TEAMMEM') ? ['TeamMem'] : []),
];
