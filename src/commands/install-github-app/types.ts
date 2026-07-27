export type Workflow = 'claude' | 'claude-review';

export interface Warning {
  title: string;
  message: string;
  instructions: string[];
}

export interface State {
  step:
    | 'check-gh'
    | 'warnings'
    | 'choose-repo'
    | 'install-app'
    | 'check-existing-workflow'
    | 'check-existing-secret'
    | 'api-key'
    | 'creating'
    | 'success'
    | 'error'
    | 'select-workflows'
    | 'oauth-flow';
  selectedRepoName: string;
  currentRepo: string;
  useCurrentRepo: boolean;
  apiKeyOrOAuthToken: string;
  useExistingKey: boolean;
  currentWorkflowInstallStep: number;
  warnings: Warning[];
  secretExists: boolean;
  secretName: string;
  useExistingSecret: boolean;
  workflowExists: boolean;
  selectedWorkflows: Workflow[];
  selectedApiKeyOption: 'existing' | 'new' | 'oauth';
  authType: 'api_key' | 'oauth_token';
  workflowAction?: 'update' | 'skip' | 'exit';
  error?: string;
  errorReason?: string;
  errorInstructions?: string[];
}
