import * as vscode from "vscode";

export type MessageCall = {
  level: "warning" | "error";
  message: string;
  actions: unknown[];
};

export type ReplacedMessages = {
  calls: MessageCall[];
  restore: () => void;
};

type MessageFunction = (message: string, ...actions: unknown[]) => Thenable<undefined>;
type MessageFunctionName = "showWarningMessage" | "showErrorMessage";

const messageHost = vscode.window as unknown as Record<MessageFunctionName, MessageFunction>;

// Replaces window.showWarningMessage and window.showErrorMessage. The replacements show nothing
// and answer as if the user closed the notification. Call `restore` in teardown.
export function replaceMessageFunctions(): ReplacedMessages {
  const calls: MessageCall[] = [];
  const { showWarningMessage, showErrorMessage } = messageHost;
  messageHost.showWarningMessage = recordCallsAs("warning", calls);
  messageHost.showErrorMessage = recordCallsAs("error", calls);
  return {
    calls,
    restore: () => Object.assign(messageHost, { showWarningMessage, showErrorMessage }),
  };
}

function recordCallsAs(level: MessageCall["level"], calls: MessageCall[]): MessageFunction {
  return (message, ...actions) => {
    calls.push({ level, message, actions });
    return Promise.resolve(undefined);
  };
}
