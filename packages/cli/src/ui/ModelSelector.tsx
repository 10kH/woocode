/**
 * @license
 * Copyright 2025 WooCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
// Types for providers - these may not exist yet in the API
interface HuggingFaceProvider {
  getGPUInfo(): Promise<{ name: string; vram: number } | null>;
  recommendModel(): Promise<string>;
}

interface ProviderManager {
  getProvider(name: string): HuggingFaceProvider | null;
  autoDetectProvider(): Promise<string>;
  listAllModels(): Promise<Array<{ provider: string; models: Array<{ id: string; name: string }> }>>;
}

interface ModelSelectorProps {
  providerManager: ProviderManager;
  onModelSelected: (provider: string, model: string) => void;
}

interface GPUInfo {
  name: string;
  vram: number;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providerManager,
  onModelSelected,
}) => {
  const [loading, setLoading] = useState(true);
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [recommendedModel, setRecommendedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [, setSelectedProvider] = useState<string>('');

  useEffect(() => {
    const detectAndRecommend = async () => {
      try {
        // Try HuggingFace provider first
        const hfProvider = providerManager.getProvider('huggingface') as HuggingFaceProvider;
        
        if (hfProvider) {
          // Get GPU info
          const gpu = await hfProvider.getGPUInfo();
          setGpuInfo(gpu);
          
          // Get recommended model
          const recommended = await hfProvider.recommendModel();
          setRecommendedModel(recommended);
          
          // List all available models
          const allModels = await providerManager.listAllModels();
          setAvailableModels(allModels);
        } else {
          // Fallback to auto-detect
          const detectedProvider = await providerManager.autoDetectProvider();
          setSelectedProvider(detectedProvider);
          
          const allModels = await providerManager.listAllModels();
          setAvailableModels(allModels);
        }
      } catch (error) {
        console.error('Error detecting models:', error);
      } finally {
        setLoading(false);
      }
    };

    detectAndRecommend();
  }, [providerManager]);

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">
          <Spinner type="dots" /> Detecting GPU and available models...
        </Text>
      </Box>
    );
  }

  const items = availableModels.flatMap(({ provider, models }: { provider: string; models: any[] }) =>
    models.map((model: any) => ({
      label: `${model.name} (${provider})${
        model.id === recommendedModel ? ' ⭐ Recommended' : ''
      }`,
      value: { provider, modelId: model.id },
    }))
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          🖥️ WooCode Model Selection
        </Text>
      </Box>

      {gpuInfo && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="cyan">
            Detected GPU: {gpuInfo.name}
          </Text>
          <Text color="cyan">
            Available VRAM: {gpuInfo.vram}GB
          </Text>
        </Box>
      )}

      {!gpuInfo && (
        <Box marginBottom={1}>
          <Text color="yellow">
            ⚠️ No GPU detected. Models will run on CPU (slower performance)
          </Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text>Select a model to use:</Text>
      </Box>

      <SelectInput
        items={items}
        onSelect={(item: { value: { provider: string; modelId: string } }) => {
          const { provider, modelId } = item.value;
          onModelSelected(provider, modelId);
        }}
      />

      <Box marginTop={1}>
        <Text dimColor>
          Use arrow keys to navigate, Enter to select
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Model download progress component
 */
interface ModelDownloadProgressProps {
  modelName: string;
  progress?: number;
  status: string;
}

export const ModelDownloadProgress: React.FC<ModelDownloadProgressProps> = ({
  modelName,
  progress,
  status,
}) => {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        📥 Downloading Model: {modelName}
      </Text>
      
      <Box marginTop={1}>
        <Text>{status}</Text>
      </Box>

      {progress !== undefined && (
        <Box marginTop={1}>
          <Text>
            Progress: {Math.round(progress * 100)}%
          </Text>
          <Box width={50}>
            <Text>
              {'█'.repeat(Math.round(progress * 50))}
              {'░'.repeat(50 - Math.round(progress * 50))}
            </Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          This is a one-time download. The model will be cached locally.
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Quick setup guide component
 */
export const QuickSetupGuide: React.FC = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">
        🚀 WooCode Quick Setup
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>No inference engine detected. Choose your setup:</Text>
        
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">1. llama.cpp (Recommended for most users)</Text>
          <Box marginLeft={3}>
            <Text dimColor>
              git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp && make
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">2. Ollama (Easy setup)</Text>
          <Box marginLeft={3}>
            <Text dimColor>
              curl -fsSL https://ollama.com/install.sh | sh
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">3. Python Transformers (Requires Python)</Text>
          <Box marginLeft={3}>
            <Text dimColor>
              pip install transformers torch accelerate
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text color="yellow">
            After installation, restart WooCode to continue.
          </Text>
        </Box>
      </Box>
    </Box>
  );
};