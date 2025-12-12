/**
 * Stop Conditions for Arium 0.2.0
 * Production-grade stop condition detection
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { EventBus } from "../eventBus";

/**
 * Stop condition types
 */
export type StopCondition =
  | { type: "max_steps"; value: number }
  | { type: "tool_call"; name: string }
  | { type: "pattern"; regex: RegExp }
  | { type: "time_limit"; milliseconds: number }
  | { type: "context_limit"; maxTokens: number };

/**
 * Stop condition manager
 */
export class StopConditionManager {
  private conditions: StopCondition[];
  private eventBus: EventBus;
  private startTime: number;
  private stepCount: number;

  constructor(eventBus: EventBus, initialConditions: StopCondition[] = []) {
    this.eventBus = eventBus;
    this.conditions = initialConditions;
    this.startTime = Date.now();
    this.stepCount = 0;
  }

  /**
   * Add stop condition
   */
  addCondition(condition: StopCondition): void {
    this.conditions.push(condition);
  }

  /**
   * Remove stop condition by type
   */
  removeCondition(type: StopCondition["type"]): void {
    this.conditions = this.conditions.filter((c) => c.type !== type);
  }

  /**
   * Clear all conditions
   */
  clearConditions(): void {
    this.conditions = [];
  }

  /**
   * Get all conditions
   */
  getConditions(): StopCondition[] {
    return [...this.conditions];
  }

  /**
   * Check if any stop condition is triggered
   */
  checkStopConditions(
    currentStep: number,
    toolName?: string,
    contextText?: string,
    currentContextSize?: number
  ): boolean {
    this.stepCount = currentStep;

    for (const condition of this.conditions) {
      if (this.checkSingleCondition(condition, toolName, contextText, currentContextSize)) {
        this.emitStopConditionTriggered(condition);
        return true;
      }
    }

    return false;
  }

  /**
   * Check single condition
   */
  private checkSingleCondition(
    condition: StopCondition,
    toolName?: string,
    contextText?: string,
    currentContextSize?: number
  ): boolean {
    switch (condition.type) {
      case "max_steps":
        return this.stepCount >= condition.value;

      case "tool_call":
        return toolName === condition.name;

      case "pattern":
        if (contextText) {
          return condition.regex.test(contextText);
        }
        return false;

      case "time_limit":
        const elapsed = Date.now() - this.startTime;
        return elapsed >= condition.milliseconds;

      case "context_limit":
        if (currentContextSize !== undefined) {
          return currentContextSize >= condition.maxTokens;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Emit stop condition triggered event
   */
  private emitStopConditionTriggered(condition: StopCondition): void {
    this.eventBus.emit("StopConditionTriggered" as any, {
      conditionType: condition.type,
      conditionDetails: condition,
      step: this.stepCount,
      timestamp: Date.now(),
    });
  }

  /**
   * Reset counter and timer
   */
  reset(): void {
    this.startTime = Date.now();
    this.stepCount = 0;
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    elapsedTime: number;
    stepsTaken: number;
    activeConditions: number;
  } {
    return {
      elapsedTime: Date.now() - this.startTime,
      stepsTaken: this.stepCount,
      activeConditions: this.conditions.length,
    };
  }

  /**
   * Create standard stop conditions
   */
  static createStandardConditions(): StopCondition[] {
    return [
      { type: "max_steps", value: 50 }, // Max 50 steps
      { type: "time_limit", milliseconds: 300000 }, // 5 minutes
      { type: "context_limit", maxTokens: 8000 }, // 8k tokens max
    ];
  }

  /**
   * Create strict stop conditions
   */
  static createStrictConditions(): StopCondition[] {
    return [
      { type: "max_steps", value: 20 }, // Max 20 steps
      { type: "time_limit", milliseconds: 60000 }, // 1 minute
      { type: "context_limit", maxTokens: 4000 }, // 4k tokens max
    ];
  }

  /**
   * Create relaxed stop conditions
   */
  static createRelaxedConditions(): StopCondition[] {
    return [
      { type: "max_steps", value: 100 }, // Max 100 steps
      { type: "time_limit", milliseconds: 600000 }, // 10 minutes
      { type: "context_limit", maxTokens: 16000 }, // 16k tokens max
    ];
  }
}

/**
 * Stop condition validator
 */
export class StopConditionValidator {
  static validateCondition(condition: any): condition is StopCondition {
    try {
      if (typeof condition !== "object" || condition === null) {
        return false;
      }

      switch (condition.type) {
        case "max_steps":
          return (
            typeof condition.value === "number" &&
            condition.value > 0 &&
            Number.isInteger(condition.value)
          );

        case "tool_call":
          return typeof condition.name === "string" && condition.name.length > 0;

        case "pattern":
          return condition.regex instanceof RegExp;

        case "time_limit":
          return (
            typeof condition.milliseconds === "number" &&
            condition.milliseconds > 0
          );

        case "context_limit":
          return (
            typeof condition.maxTokens === "number" &&
            condition.maxTokens > 0 &&
            Number.isInteger(condition.maxTokens)
          );

        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  static validateConditions(conditions: any[]): conditions is StopCondition[] {
    return conditions.every((c) => this.validateCondition(c));
  }

  static createFromConfig(config: any): StopCondition[] {
    if (!Array.isArray(config)) {
      throw new Error("Stop conditions config must be an array");
    }

    const validConditions: StopCondition[] = [];

    for (const item of config) {
      try {
        let condition: StopCondition;

        switch (item.type) {
          case "max_steps":
            condition = {
              type: "max_steps",
              value: parseInt(item.value, 10),
            };
            break;

          case "tool_call":
            condition = {
              type: "tool_call",
              name: String(item.name),
            };
            break;

          case "pattern":
            condition = {
              type: "pattern",
              regex: new RegExp(item.regex),
            };
            break;

          case "time_limit":
            condition = {
              type: "time_limit",
              milliseconds: parseInt(item.milliseconds, 10),
            };
            break;

          case "context_limit":
            condition = {
              type: "context_limit",
              maxTokens: parseInt(item.maxTokens, 10),
            };
            break;

          default:
            throw new Error(`Unknown stop condition type: ${item.type}`);
        }

        if (this.validateCondition(condition)) {
          validConditions.push(condition);
        }
      } catch (error) {
        console.warn(`Invalid stop condition: ${(error as Error).message}`);
      }
    }

    return validConditions;
  }
}

/**
 * Stop condition checker for AgentCore integration
 */
export class AgentStopConditionChecker {
  private manager: StopConditionManager;

  constructor(eventBus: EventBus, conditions: StopCondition[] = []) {
    this.manager = new StopConditionManager(eventBus, conditions);
  }

  /**
   * Check if agent should stop
   */
  shouldStop(
    currentStep: number,
    toolName?: string,
    contextText?: string,
    currentContextSize?: number
  ): boolean {
    return this.manager.checkStopConditions(
      currentStep,
      toolName,
      contextText,
      currentContextSize
    );
  }

  /**
   * Add condition
   */
  addCondition(condition: StopCondition): void {
    this.manager.addCondition(condition);
  }

  /**
   * Get stats
   */
  getStats(): {
    elapsedTime: number;
    stepsTaken: number;
    activeConditions: number;
  } {
    return this.manager.getStats();
  }

  /**
   * Reset checker
   */
  reset(): void {
    this.manager.reset();
  }
}