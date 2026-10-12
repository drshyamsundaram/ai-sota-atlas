import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { useState } from "react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import paniniMark from "@/assets/panini-mark.png";

export const PANINI_SAMPLES = [
  "Which Chinese model has the most tokens?",
  "Find the Anthropic model that scores on HealthBench",
  "Which accelerators were used to train Llama 3.1 405B?",
  "I'm thinking of a French open model used for coding",
];

export function PaniniChat({ compact = false, onIdentify }: { compact?: boolean; onIdentify?: (id: string) => void }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/panini" }),
    onError: (e) => toast.error(e.message || "Panini could not answer"),
    onFinish: ({ message }) => {
      const id = message.parts.flatMap((p) => (isToolUIPart(p) && getToolName(p) === "identify" ? [(p.input as { matches?: { id: string }[] })?.matches?.[0]?.id] : [])).at(-1);
      if (id && onIdentify) onIdentify(id);
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => { if (!text.trim() || busy) return; sendMessage({ text }); setInput(""); };

  return (
    <div className={`flex flex-col rounded-md border border-border bg-card ${compact ? "h-[520px]" : "h-[calc(100vh-260px)] min-h-[520px]"}`}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <img src={paniniMark} alt="" className="size-6 rounded" />
        <span className="font-semibold">Panini</span>
        <span className="mono-label text-muted-foreground">AI-SOTA KG identifier</span>
      </div>
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState title="Ask Panini" description="Describe a model, developer, benchmark or chip — Panini asks questions until it finds the exact node.">
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {PANINI_SAMPLES.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary">{s}</button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent className={m.role === "user" ? "bg-primary text-primary-foreground" : ""}>
                  {m.parts.map((p, i) => {
                    if (p.type === "text") return <MessageResponse key={i}>{p.text}</MessageResponse>;
                    if (isToolUIPart(p)) {
                      const name = getToolName(p);
                      if (name === "identify" && p.input) {
                        return (
                          <details key={i} open className="rounded border border-border bg-muted/40 p-2 text-xs">
                            <summary className="mono-label cursor-pointer">JSON output</summary>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(p.input, null, 2)}</pre>
                          </details>
                        );
                      }
                      return (
                        <Tool key={i} defaultOpen={false}>
                          <ToolHeader type={p.type as never} state={p.state} title={name.replace(/_/g, " ")} />
                          <ToolContent>
                            <ToolInput input={p.input} />
                            <ToolOutput output={p.output} errorText={p.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && <Shimmer>Searching the graph…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-2">
        <PromptInput onSubmit={(msg) => send(msg.text ?? "")}>
          <PromptInputTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Which Indian model scores on IndicGenBench?" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
