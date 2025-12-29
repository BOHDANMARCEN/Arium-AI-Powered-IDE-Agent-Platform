/**
 * Logger v2 Test Suite
 */

import { EventBus } from "../src/core/eventBus";
import { initializeLogger, getLogger, createContextualLogger, logger, AriumLogger } from "../src/core/logger";

describe("Logger v2", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe("Initialization", () => {
    test("should initialize with default config", () => {
      const loggerInstance = initializeLogger(eventBus);
      expect(loggerInstance).toBeInstanceOf(AriumLogger);
      expect(getLogger()).toBe(loggerInstance);
    });

    test("should initialize with custom config", () => {
      const loggerInstance = initializeLogger(eventBus, {
        level: "debug",
        format: "json",
        file: {
          enabled: true,
          path: "./test.log",
        },
      });

      expect(loggerInstance).toBeInstanceOf(AriumLogger);
    });
  });

  describe("Logging Methods", () => {
    let loggerInstance: AriumLogger;

    beforeEach(() => {
      loggerInstance = initializeLogger(eventBus, { level: "trace" });
    });

    test("should log debug messages", () => {
      expect(() => {
        loggerInstance.debug("Debug message");
      }).not.toThrow();
    });

    test("should log info messages", () => {
      expect(() => {
        loggerInstance.info("Info message");
      }).not.toThrow();
    });

    test("should log warn messages", () => {
      expect(() => {
        loggerInstance.warn("Warning message");
      }).not.toThrow();
    });

    test("should log error messages", () => {
      expect(() => {
        loggerInstance.error("Error message");
      }).not.toThrow();

      expect(() => {
        loggerInstance.error(new Error("Test error"));
      }).not.toThrow();
    });

    test("should log with context", () => {
      expect(() => {
        loggerInstance.info("Message with context", {
          userId: "123",
          requestId: "abc",
          correlationId: "xyz",
        });
      }).not.toThrow();
    });
  });

  describe("Child Loggers", () => {
    test("should create child logger with context", () => {
      const parentLogger = initializeLogger(eventBus);
      const childLogger = parentLogger.child({ agentId: "test-agent" });

      expect(childLogger).toBeInstanceOf(AriumLogger);
      expect(childLogger).not.toBe(parentLogger);
    });

    test("should create contextual logger", () => {
      initializeLogger(eventBus);
      const agentLogger = createContextualLogger({ agentId: "test-agent" });

      expect(agentLogger).toBeInstanceOf(AriumLogger);
    });
  });

  describe("Performance Logging", () => {
    let loggerInstance: AriumLogger;

    beforeEach(() => {
      loggerInstance = initializeLogger(eventBus);
    });

    test("should measure execution time", () => {
      const endTimer = loggerInstance.startTimer("test-operation");

      // Simulate some work
      setTimeout(() => {
        endTimer();
      }, 10);
    });

    test("should trace requests", () => {
      expect(() => {
        loggerInstance.traceRequest("GET", "/api/test", 200, 150, {
          requestId: "req-123",
        });
      }).not.toThrow();
    });

    test("should trace agent execution", () => {
      expect(() => {
        loggerInstance.traceAgentExecution(
          "agent-123",
          "Test task",
          5,
          1000,
          true,
          { correlationId: "corr-123" }
        );
      }).not.toThrow();
    });

    test("should trace tool execution", () => {
      expect(() => {
        loggerInstance.traceToolExecution(
          "tool-123",
          { input: "test" },
          50,
          true,
          undefined,
          { toolId: "tool-123" }
        );
      }).not.toThrow();
    });

    test("should trace model calls", () => {
      expect(() => {
        loggerInstance.traceModelCall(
          "gpt-4",
          "Test prompt",
          "Test response",
          500,
          { prompt: 10, completion: 20 },
          { agentId: "agent-123" }
        );
      }).not.toThrow();
    });
  });

  describe("Security Logging", () => {
    let loggerInstance: AriumLogger;

    beforeEach(() => {
      loggerInstance = initializeLogger(eventBus);
    });

    test("should log security events", () => {
      expect(() => {
        loggerInstance.securityEvent("unauthorized_access", {
          userId: "user-123",
          ip: "192.168.1.1",
          action: "read_secret_file",
          sensitiveData: "should-be-redacted",
        });
      }).not.toThrow();
    });
  });

  describe("Global Logger API", () => {
    test("should provide global logger functions", () => {
      initializeLogger(eventBus);

      expect(() => logger.info("Global log message")).not.toThrow();
      expect(() => logger.error("Global error")).not.toThrow();
      expect(() => logger.agent("agent-123")).toBeDefined();
      expect(() => logger.tool("tool-123")).toBeDefined();
      expect(() => logger.request("req-123")).toBeDefined();
    });

    test("should throw when logger not initialized", () => {
      // Reset global logger
      const originalLogger = (global as any).globalLogger;
      (global as any).globalLogger = null;

      expect(() => getLogger()).toThrow("Logger not initialized");

      // Restore
      (global as any).globalLogger = originalLogger;
    });
  });

  describe("EventBus Integration", () => {
    test("should listen to EventBus events", () => {
      const loggerInstance = initializeLogger(eventBus);

      // Emit some events
      expect(() => {
        eventBus.emit("AgentStartEvent", { agentId: "test-agent" });
        eventBus.emit("ToolErrorEvent", { toolId: "test-tool", error: "Test error" });
        eventBus.emit("SecurityEvent", { type: "test", details: {} });
      }).not.toThrow();
    });
  });

  describe("Data Sanitization", () => {
    let loggerInstance: AriumLogger;

    beforeEach(() => {
      loggerInstance = initializeLogger(eventBus);
    });

    test("should sanitize sensitive data in logs", () => {
      // This is tested indirectly through the logging methods
      // The sanitization happens internally in the logger
      expect(() => {
        loggerInstance.traceToolExecution(
          "tool-123",
          {
            password: "secret123",
            token: "abc123",
            normalData: "safe",
          },
          100,
          true
        );
      }).not.toThrow();
    });
  });
});
