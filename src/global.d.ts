// Global type declarations
declare module 'bun:bundle' {
  export function feature(name: string): boolean;
}

declare global {
  var MACRO: {
    VERSION: string;
    PACKAGE_URL: string;
    NATIVE_PACKAGE_URL?: string;
    FEEDBACK_CHANNEL: string;
    ISSUES_EXPLAINER: string;
  };
}

export {};
