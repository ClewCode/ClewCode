// Helper function to get the appropriate prose description for rule behavior
export function getRuleBehaviorDescription(permissionResult) {
    switch (permissionResult) {
        case 'allow':
            return 'allowed';
        case 'deny':
            return 'denied';
        default:
            return 'asked for confirmation for';
    }
}
