# LLM Hardware & Chipsets

## Proposed approach

Add **Hardware & Chipsets** as a dedicated section alongside the leaderboards, token report and knowledge graph. It should answer three practical questions:

1. Which chips and server systems are suitable for a particular model and workload?
2. What limits the workload: memory capacity, memory bandwidth, compute, networking or software support?
3. Which claims are measured, officially disclosed or merely estimated?

“Ideal hardware” should mean **best fit for stated constraints**, not a universal winner. Pretraining is the initial training phase; continued pretraining, full fine-tuning, parameter-efficient fine-tuning and inference need distinct comparisons.

## 1. Hardware catalogue

Provide searchable, filterable tables and a side-by-side comparison for two to four items.

**Chipset / accelerator details**
- Vendor, product, architecture, availability and form factor.
- Accelerator memory capacity, type and bandwidth.
- Compute by precision: FP32, BF16/FP16, FP8 and supported low-bit formats; distinguish dense from sparse figures.
- Supported precision versus independently measured performance.
- Power envelope, host interface and accelerator-to-accelerator interconnect.
- Software ecosystem, framework support and distributed-training compatibility.

**Server / system details**
- Server vendor and configuration, accelerator model and count.
- Memory per accelerator and aggregate memory, without implying it is automatically a single shared pool.
- Host CPUs, system RAM, local storage and data-feeding considerations.
- Scale-up topology, scale-out networking and rack-level power/cooling needs.
- Cloud availability and timestamped public pricing where available; missing prices remain unknown.

Initial candidate coverage: NVIDIA H100/H200/B200 and GB200 systems, AMD MI300X/MI325X/MI350-series systems, Google TPU and AWS Trainium/Inferentia. Include server configurations from NVIDIA reference systems, Dell, HPE, Lenovo and Supermicro where specifications are publicly documented. Verify current product specifications and availability before adding records; avoid an exhaustive catalogue in the first release.

## 2. Workload suitability

Separate views for:

| Workload | Primary considerations |
| --- | --- |
| Pretraining / continued pretraining | Model size, training tokens, optimizer state, activation memory, throughput, distributed strategy and cluster networking |
| Full fine-tuning | Training precision, optimizer memory, sequence length, batch size, checkpointing and multi-device sharding |
| LoRA / QLoRA fine-tuning | Base-model precision, adapter configuration, activation memory and quantization/framework compatibility |
| Inference | Weight memory, KV cache, context length, concurrency, quantization, latency and serving throughput |

Add a **workload sizing panel** with model parameters, context length, batch/concurrency, precision, workload and relevant training settings. Show a memory breakdown, estimated accelerator-count range, assumptions and configurable headroom. Use architecture-specific KV-cache estimates only when the necessary model configuration is known.

Estimates are planning aids—not measured benchmarks, guaranteed fit or training-duration promises. Do not derive reliable time-to-train or tokens/second from theoretical FLOPS alone. Explain constraints such as communication overhead, utilization, memory fragmentation and framework support in the result.

## 3. Evidence-backed performance

Reuse the existing MLPerf Inference source where appropriate, retaining the **system configuration**, benchmark workload, scenario, precision, division and result version. Offline throughput must not be presented as interactive serving latency.

Assess MLPerf Training separately for useful public results. Its prescribed training tasks and time-to-target results are not directly comparable to arbitrary LLM pretraining or fine-tuning.

Source priority:
1. Official chip and server specification sheets.
2. MLCommons published training/inference results.
3. Official cloud documentation and pricing.
4. Model technical reports or model cards that disclose hardware actually used.

Each record carries source links, retrieval date and evidence status. Manufacturer specifications, measured results, reported model deployments and sizing estimates remain visibly separate. Unpublished hardware details stay unknown.

## 4. Connections to models and the knowledge graph

Extend the graph with **Accelerator**, **Server system** and **Hardware vendor** entities, plus relationships for system composition and measured benchmark results.

Use separate relationships for:
- **Reported trained/fine-tuned/served on** — only when a cited report explicitly identifies the model and hardware.
- **Estimated suitable for** — a sizing recommendation, not historical evidence.
- **Benchmarked on** — a specific benchmark/system result, not proof of production deployment.

Do not infer a model’s actual training hardware from its developer, token usage or MLPerf workload name. Extend the existing shared graph builder while keeping the graph renderer browser-only.

## 5. Suggested first release

- Hardware catalogue and server configurations.
- Side-by-side comparison and workload filters.
- Memory-sizing estimates for inference, LoRA/QLoRA and full fine-tuning; pretraining gets a requirements assessment rather than a speculative time/cost calculator.
- Evidence-linked MLPerf results and explicitly disclosed model–hardware relationships.
- Sources panel, CSV export and a distinct “last verified” timestamp.
- Existing Refresh now checks supported machine-readable hardware sources; manually curated specifications retain their original verification date until reverified.

## Documentation and technical details

- Add a dedicated `/hardware` page with app-specific metadata and links in the existing navigation.
- Keep specifications, system configurations, measured results and estimates as separate typed records in a configuration-driven hardware module.
- Preserve existing benchmark and token data semantics; record additional MLPerf system context rather than treating hardware as a model version.
- Update README, Architecture and How to use with workload assumptions, evidence rules and new controls.
- Add `ontology/hardware.ttl`, extend the knowledge-graph ontology, and expose downloads and ontology metrics in Docs.
- Save all source and documentation changes in the project for the existing GitHub sync; verify sync availability rather than claiming a remote push.

## Validation

Check specification units and precision labels, sizing calculations against documented reference configurations, source provenance, graph relationship distinctions, comparison/export behavior and page rendering. Unsupported or unavailable sources are marked reference-only; no hardware specifications, prices or deployment claims are invented.