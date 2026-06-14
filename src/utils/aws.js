import { logForDebugging } from './debug.js';
export function isAwsCredentialsProviderError(err) {
    return err?.name === 'CredentialsProviderError';
}
/** Typeguard to validate AWS STS assume-role output */
export function isValidAwsStsOutput(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const output = obj;
    // Check if Credentials exists and has required fields
    if (!output.Credentials || typeof output.Credentials !== 'object') {
        return false;
    }
    const credentials = output.Credentials;
    return (typeof credentials.AccessKeyId === 'string' &&
        typeof credentials.SecretAccessKey === 'string' &&
        typeof credentials.SessionToken === 'string' &&
        credentials.AccessKeyId.length > 0 &&
        credentials.SecretAccessKey.length > 0 &&
        credentials.SessionToken.length > 0);
}
/** Throws if STS caller identity cannot be retrieved. */
export async function checkStsCallerIdentity() {
    const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    await new STSClient().send(new GetCallerIdentityCommand({}));
}
/**
 * Clear AWS credential provider cache by forcing a refresh
 * This ensures that any changes to ~/.aws/credentials are picked up immediately
 */
export async function clearAwsIniCache() {
    try {
        logForDebugging('Clearing AWS credential provider cache');
        const { fromIni } = await import('@aws-sdk/credential-providers');
        const iniProvider = fromIni({ ignoreCache: true });
        await iniProvider(); // This updates the global file cache
        logForDebugging('AWS credential provider cache refreshed');
    }
    catch (_error) {
        // Ignore errors - we're just clearing the cache
        logForDebugging('Failed to clear AWS credential cache (this is expected if no credentials are configured)');
    }
}
