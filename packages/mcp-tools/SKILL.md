---
name: mcp-tools-development
description: MCP Server 开发最佳实践 - 使用 AWS Lambda 构建 MCP 工具服务
---

# MCP Tools 开发技能

本文档记录使用 AWS Lambda 构建 MCP (Model Context Protocol) Server 的最佳实践和踩坑经验。

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client (Cursor/Claude)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  image-workshop-mcp (Router)                │
│  - 接收 JSON-RPC 2.0 请求                                   │
│  - tools/list: 返回 TOOL_REGISTRY 中所有工具                │
│  - tools/call: 路由到对应 Lambda                            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────┐        ┌──────────────────────┐
│ tool-txt2img-...     │        │ tool-xxx-...         │
│ 实际执行工具逻辑      │        │ 更多工具...           │
└──────────────────────┘        └──────────────────────┘
```

## 共享包结构

```
packages/mcp-tools/
├── src/
│   ├── types.ts              # 类型定义
│   ├── tools/
│   │   ├── txt2img-stable-diffusion.ts  # 工具 schema
│   │   └── index.ts          # 导出所有工具
│   ├── registry.ts           # TOOL_REGISTRY
│   └── index.ts              # 主入口
├── package.json
└── tsconfig.json
```

## 新增 Tool 流程

只需 3 步：

### 1. 创建工具 Schema

在 `packages/mcp-tools/src/tools/` 创建新文件：

```typescript
// packages/mcp-tools/src/tools/my-new-tool.ts
import type { McpToolDefinition } from '../types';

export const myNewTool: McpToolDefinition = {
  name: 'my_new_tool',
  description: 'Tool description for MCP client',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['param1'],
  },
};
```

在 `tools/index.ts` 中导出：

```typescript
export { myNewTool } from './my-new-tool';
```

### 2. 注册到 Registry

在 `packages/mcp-tools/src/registry.ts` 添加：

```typescript
import { myNewTool } from './tools';

export const TOOL_REGISTRY: McpToolConfig[] = [
  // ... existing tools
  {
    ...myNewTool,
    lambdaFunction: 'MyNewToolFunction',
    apiPath: '/tools/my-new-tool',
  },
];
```

### 3. 创建 Lambda 函数

```bash
bun run create:function tool-my-new-tool
```

在 Lambda 中使用共享 schema：

```typescript
import { myNewTool } from '@image-workshop/mcp-tools';
export const toolSchema = myNewTool;
```

**无需修改 Router 代码！**

## 踩坑记录

### 1. SAM Local 环境变量配置

**问题**：`env.json` 中的变量没有被 Lambda 读取

**原因**：SAM local 的 `--env-vars` 只能 **覆盖** `template.yaml` 中已声明的变量，不能新增

**解决方案**：在 `template.yaml` 中声明变量（可以为空字符串）：

```yaml
Environment:
  Variables:
    LOCAL_API_BASE_URL: ""  # 允许 env.json 覆盖
    STABILITY_API_KEY: ""   # 允许 env.json 覆盖
```

### 2. Docker 容器内访问宿主机服务

**问题**：Lambda 在 Docker 容器内运行，无法通过 `127.0.0.1` 访问宿主机的 SAM local API

**原因**：Docker 容器有独立网络，`127.0.0.1` 指向容器本身

**解决方案**：使用 `host.docker.internal`：

```json
{
  "ImageWorkshopMcpFunction": {
    "LOCAL_API_BASE_URL": "http://host.docker.internal:3000"
  }
}
```

### 3. MCP 协议版本和方法名

**问题**：Client 发送 `notifications/initialized`，Server 只处理 `initialized`

**原因**：MCP 协议有多个版本，方法名可能不同

**解决方案**：同时处理两种格式：

```typescript
case 'initialized':
case 'notifications/initialized':
  result = {};
  break;
```

并在 `handleInitialize` 中返回正确的协议版本。

### 4. Lambda 间调用 - 本地 vs 生产

**问题**：本地开发时，Router Lambda 无法通过 AWS SDK 调用 Tool Lambda

**原因**：SAM local 运行的 Lambda 没有真正的 ARN

**解决方案**：双模式调用 - 本地用 HTTP，生产用 Lambda SDK：

```typescript
const localBaseUrl = process.env.LOCAL_API_BASE_URL;

if (localBaseUrl) {
  // 本地开发：通过 HTTP 调用 SAM local API Gateway
  toolResult = await invokeToolViaHttp(tool, args, localBaseUrl);
} else {
  // 生产环境：通过 Lambda SDK 调用
  toolResult = await invokeToolViaLambda(tool, args, region);
}
```

### 5. Schema 重复定义

**问题**：Router 和 Tool Lambda 都定义了相同的 schema，难以维护

**解决方案**：创建共享包 `@image-workshop/mcp-tools`：

- Schema 只定义一次
- Router 导入 `TOOL_REGISTRY`
- Tool Lambda 导入各自的 schema

## 类型定义

### McpToolDefinition

工具的 MCP 协议定义：

```typescript
interface McpToolDefinition {
  name: string;           // 工具名（snake_case）
  description: string;    // 描述（供 MCP client 展示）
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

### McpToolConfig

包含部署配置的完整定义：

```typescript
interface McpToolConfig extends McpToolDefinition {
  lambdaFunction: string;  // CloudFormation 资源名
  apiPath: string;         // SAM local API 路径
}
```

## 配置管理

使用 `@image-workshop/aws-config` 统一管理配置：

```typescript
import { getKnownConfig, getValue } from '@image-workshop/aws-config';

// 获取已知配置（ENV → Secrets Manager）
const apiKey = await getKnownConfig('STABILITY_API_KEY', { required: true });

// 获取任意配置（ENV → Parameter Store → 默认值）
const model = await getValue('STABILITY_MODEL', {
  parameterId: '/image-workshop/stability/model',
  defaultValue: 'stable-diffusion-xl-1024-v1-0',
});
```

**优先级**：环境变量 > Secrets Manager/Parameter Store > 默认值

## 本地开发命令

```bash
# 构建并启动本地 MCP Server
bun run sam:build
bun run sam:local

# 测试 MCP 请求
Invoke-RestMethod -Uri "http://localhost:3000/mcp" `
  -Method POST -ContentType "application/json" `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Cursor MCP 配置

```json
{
  "mcpServers": {
    "image-workshop-mcp-server": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```
