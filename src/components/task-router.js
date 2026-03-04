// Intelligent task routing - Project Manager delegates tasks to specialist roles
// Enables multi-agent collaboration through role-based task distribution

import { store } from "../store.js";
import { connectionManager } from "../main.js";
import { getConnectionRole, getProjectManagers, getConnectionsByRole } from "./roles.js";
import { showToast } from "../components/sidebar.js";

/**
 * Smart task router - analyzes user request and routes to appropriate specialist
 */
export class TaskRouter {
  constructor() {
    this.routingHistory = [];
  }

  /**
   * Analyze task and determine which role(s) should handle it
   */
  async analyzeTask(taskText, pmConnectionId) {
    const client = connectionManager.getClient(pmConnectionId);
    if (!client) return null;

    const state = store.getState();
    const roles = state.connectionRoles || {};

    // Get available specialists
    const specialists = store.getConnections()
      .filter(conn => {
        const role = roles[conn.id];
        return role && role.roleId !== "project-manager" &&
               state.connectionStatuses[conn.id] === "connected";
      })
      .map(conn => ({
        id: conn.id,
        name: conn.name,
        role: roles[conn.id].roleName,
        description: roles[conn.id].description
      }));

    if (specialists.length === 0) {
      return {
        type: "direct",
        message: "没有可用的专家角色，将直接处理任务"
      };
    }

    // Ask PM to analyze and route
    const analysisPrompt = `
你是一个项目经理，负责将用户任务分配给合适的专家团队成员。

可用的专家团队：
${specialists.map(s => `- ${s.name} (${s.role}): ${s.description}`).join("\n")}

用户任务：
${taskText}

请分析这个任务，并返回 JSON 格式的任务分配方案：
{
  "strategy": "single" | "parallel" | "sequential",
  "assignments": [
    {
      "specialistId": "连接ID",
      "specialistRole": "角色名称",
      "subtask": "分配给该专家的具体任务",
      "priority": 1-5,
      "estimatedTime": "预计耗时"
    }
  ],
  "reasoning": "为什么这样分配的原因"
}

策略说明：
- single: 单个专家可以完成
- parallel: 多个专家并行工作
- sequential: 多个专家按顺序工作（前一个的输出是后一个的输入）

只返回 JSON，不要其他内容。
`;

    try {
      const response = await client.sendMessage("main", analysisPrompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("Task analysis failed:", err);
    }

    return null;
  }

  /**
   * Execute task routing based on strategy
   */
  async executeRouting(routing, originalTask) {
    if (!routing || !routing.assignments) {
      return null;
    }

    const results = [];

    switch (routing.strategy) {
      case "single":
        results.push(await this.executeSingleTask(routing.assignments[0], originalTask));
        break;

      case "parallel":
        const parallelResults = await Promise.all(
          routing.assignments.map(assignment =>
            this.executeSingleTask(assignment, originalTask)
          )
        );
        results.push(...parallelResults);
        break;

      case "sequential":
        let previousResult = originalTask;
        for (const assignment of routing.assignments) {
          const result = await this.executeSingleTask(assignment, previousResult);
          results.push(result);
          previousResult = result.output;
        }
        break;
    }

    return {
      strategy: routing.strategy,
      results,
      reasoning: routing.reasoning
    };
  }

  /**
   * Execute a single task assignment
   */
  async executeSingleTask(assignment, context) {
    const client = connectionManager.getClient(assignment.specialistId);
    if (!client) {
      return {
        specialistId: assignment.specialistId,
        specialistRole: assignment.specialistRole,
        subtask: assignment.subtask,
        status: "failed",
        error: "连接不可用"
      };
    }

    const role = getConnectionRole(assignment.specialistId);
    const rolePrompt = role?.customPrompt || role?.description || "";

    const fullPrompt = `
你的角色：${assignment.specialistRole}
专业领域：${rolePrompt}

任务：${assignment.subtask}

${context !== assignment.subtask ? `\n上下文信息：\n${context}` : ""}

请完成这个任务，给出详细的结果。
`;

    try {
      const startTime = Date.now();
      const output = await client.sendMessage("main", fullPrompt);
      const duration = Date.now() - startTime;

      return {
        specialistId: assignment.specialistId,
        specialistRole: assignment.specialistRole,
        subtask: assignment.subtask,
        status: "success",
        output,
        duration
      };
    } catch (err) {
      return {
        specialistId: assignment.specialistId,
        specialistRole: assignment.specialistRole,
        subtask: assignment.subtask,
        status: "failed",
        error: err.message
      };
    }
  }

  /**
   * Summarize results from multiple specialists
   */
  async summarizeResults(pmConnectionId, routing, results, originalTask) {
    const client = connectionManager.getClient(pmConnectionId);
    if (!client) return null;

    const summaryPrompt = `
你是项目经理，刚才将任务分配给了团队成员，现在需要汇总他们的工作成果。

原始任务：
${originalTask}

执行策略：${routing.strategy === "parallel" ? "并行执行" : routing.strategy === "sequential" ? "顺序执行" : "单人执行"}

团队成员的工作成果：
${results.map((r, i) => `
${i + 1}. ${r.specialistRole}
   任务：${r.subtask}
   状态：${r.status === "success" ? "✓ 完成" : "✗ 失败"}
   ${r.status === "success" ? `结果：\n${r.output}` : `错误：${r.error}`}
   耗时：${r.duration ? Math.round(r.duration / 1000) + "秒" : "N/A"}
`).join("\n")}

请作为项目经理：
1. 整合所有成员的工作成果
2. 给出完整、连贯的最终答案
3. 如果有失败的任务，说明影响并给出建议
4. 总结整个协作过程

最终报告：
`;

    try {
      return await client.sendMessage("main", summaryPrompt);
    } catch (err) {
      console.error("Summary failed:", err);
      return null;
    }
  }
}

/**
 * Check if message should be routed through PM
 */
export function shouldUseTaskRouting(connId) {
  const role = getConnectionRole(connId);
  return role?.roleId === "project-manager";
}

/**
 * Main entry point for intelligent task routing
 */
export async function routeTask(pmConnectionId, taskText, onProgress) {
  const router = new TaskRouter();

  try {
    // Step 1: Analyze task
    onProgress?.({ stage: "analyzing", message: "项目经理正在分析任务..." });
    const routing = await router.analyzeTask(taskText, pmConnectionId);

    if (!routing || routing.type === "direct") {
      onProgress?.({ stage: "direct", message: "直接处理任务" });
      return null; // Fall back to direct execution
    }

    // Step 2: Show routing plan
    onProgress?.({
      stage: "planning",
      message: `任务分配方案：${routing.strategy}`,
      routing
    });

    // Step 3: Execute routing
    onProgress?.({ stage: "executing", message: "团队成员开始工作..." });
    const executionResult = await router.executeRouting(routing, taskText);

    // Step 4: Summarize
    onProgress?.({ stage: "summarizing", message: "项目经理正在汇总结果..." });
    const summary = await router.summarizeResults(
      pmConnectionId,
      routing,
      executionResult.results,
      taskText
    );

    return {
      routing,
      execution: executionResult,
      summary
    };
  } catch (err) {
    console.error("Task routing failed:", err);
    onProgress?.({ stage: "error", message: err.message });
    return null;
  }
}
