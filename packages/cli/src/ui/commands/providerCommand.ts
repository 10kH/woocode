/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';

export const providerCommand: SlashCommand = {
  name: 'provider',
  description: 'Manage LLM providers (list, switch, info)',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, argsStr: string) => {
    const args = argsStr.trim().split(/\s+/);
    const config = context.services.config;
    const addItem = context.ui.addItem;
    const subcommand = args[0];
    
    if (!config?.isUsingProviderSystem()) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'Provider system is not enabled. Set useProviderSystem: true in settings.',
        },
        Date.now(),
      );
      return;
    }

    const adapter = config.getProviderAdapter();
    if (!adapter) {
      addItem(
        {
          type: MessageType.ERROR,
          text: 'Provider adapter not initialized.',
        },
        Date.now(),
      );
      return;
    }

    switch (subcommand) {
      case 'list': {
        try {
          const models = await adapter.getAvailableModels();
          let message = '📋 Available Providers and Models:\n\n';
          
          for (const { provider, models: providerModels } of models) {
            message += `**${provider}**:\n`;
            for (const model of providerModels) {
              message += `  • ${model.name}`;
              if (model.description) {
                message += ` - ${model.description}`;
              }
              message += '\n';
            }
            message += '\n';
          }
          
          addItem(
            {
              type: MessageType.INFO,
              text: message,
            },
            Date.now(),
          );
        } catch (error) {
          addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to list models: ${error}`,
            },
            Date.now(),
          );
          return;
        }
        break;
      }
      
      case 'switch': {
        const provider = args[1];
        const model = args[2];
        
        if (!provider) {
          addItem(
            {
              type: MessageType.ERROR,
              text: 'Usage: /provider switch <provider> [model]\nExample: /provider switch huggingface Qwen/Qwen3-Coder-30B-A3B-Instruct',
            },
            Date.now(),
          );
          return;
        }
        
        try {
          await adapter.switchProvider(provider, model);
          const info = adapter.getCurrentProviderInfo();
          
          addItem(
            {
              type: MessageType.INFO,
              text: `✅ Switched to ${info.provider} with model ${info.model}`,
            },
            Date.now(),
          );
        } catch (error) {
          addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to switch provider: ${error}`,
            },
            Date.now(),
          );
          return;
        }
        break;
      }
      
      case 'info':
      default: {
        const info = adapter.getCurrentProviderInfo();
        addItem(
          {
            type: MessageType.INFO,
            text: `📊 Current Provider:\n• Provider: ${info.provider}\n• Model: ${info.model}\n\nUse "/provider list" to see available providers\nUse "/provider switch <provider> [model]" to change`,
          },
          Date.now(),
        );
        break;
      }
    }

    return;
  },
};

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Show current model or switch models',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, argsStr: string) => {
    const config = context.services.config;
    const addItem = context.ui.addItem;
    
    if (!config?.isUsingProviderSystem()) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'Provider system is not enabled. Set useProviderSystem: true in settings.',
        },
        Date.now(),
      );
      return;
    }

    const adapter = config.getProviderAdapter();
    if (!adapter) {
      addItem(
        {
          type: MessageType.ERROR,
          text: 'Provider adapter not initialized.',
        },
        Date.now(),
      );
      return;
    }
    
    const info = adapter.getCurrentProviderInfo();
    addItem(
      {
        type: MessageType.INFO,
        text: `📊 Current Model:\n• Provider: ${info.provider}\n• Model: ${info.model}\n\nUse "/provider switch <provider> [model]" to change provider\nRestart with --provider flag to use model selector UI`,
      },
      Date.now(),
    );
    
    return;
  },
};