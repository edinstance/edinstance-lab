import { context, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const endpoint = (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"
).replace(/\/$/, "");
const serviceName = process.env.OTEL_SERVICE_NAME || "platform-frontend";
const parsedRatio = Number.parseFloat(
  process.env.OTEL_TRACES_SAMPLER_ARG ||
    (process.env.NODE_ENV === "production" ? "0.2" : "1"),
);
const ratio =
  Number.isFinite(parsedRatio) && parsedRatio >= 0 && parsedRatio <= 1
    ? parsedRatio
    : 0.2;

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || "dev",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
      process.env.OTEL_DEPLOYMENT_ENVIRONMENT || "development",
  }),
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
  }),
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

try {
  sdk.start();
  console.info("OpenTelemetry SDK started successfully");
} catch (error) {
  console.error("OpenTelemetry SDK failed to start", error);
}

for (const level of ["info", "warn", "error"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    if (spanContext?.traceId) {
      original(
        {
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
          service: serviceName,
        },
        ...args,
      );
      return;
    }
    original(...args);
  };
}

const shutdown = () =>
  sdk
    .shutdown()
    .catch((error) => console.error("OpenTelemetry shutdown failed", error));

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
