# Programmable Jev MCP: first runtime

The connected agent should be able to create capabilities by authoring typed questions, composing dependent stages, testing examples, and retaining versions and outcomes. The MCP is the reusable runtime; the TypeSafe skill remains reference material, not the boundary of what can be built.

The first server exposes ten operations: `jev_judge`, `define_capability`, `get_capability`, `list_capabilities`, `run_capability`, `evaluate_capability`, `store_records`, `search_records`, `get_run`, and `record_outcome`. Stages contain Choice, Score, and Noul questions, with optional conditions on earlier answers. Code owns filtering, ranking, bounded batch execution, persistence, and version identity. Host scripts can compose these operations with any other tools.

Three trade-offs:

1. Use declarative stages inside the server and ordinary host-side scripts for arbitrary computation. This keeps custom capabilities inspectable without adding a second shell/code executor to the MCP.
2. Use local SQLite and full-text retrieval first. Search results and records from vector databases share the same JSON input contract; native Qdrant/Chroma adapters and embedding generation remain separate additions if measurements justify them.
3. Permit new versions immediately within the user's authorized work, while keeping test results and reported outcomes attached to exact versions. Saving a capability does not label it validated. Old versions and original records remain available.

Verification will include a real stdio MCP client, MCP Inspector, persistent storage, error recovery, pagination, conditional stages, evaluation, and live Jev experiments for retrieval and data processing. No OpenAI or Anthropic model API will be called. The server will use the existing OpenRouter Decisions transport by default, with direct TypeSafe opt-in.
