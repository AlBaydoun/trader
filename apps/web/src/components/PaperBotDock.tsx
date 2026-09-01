import { ChevronDown, ChevronRight, ChevronUp, GripVertical } from "lucide-react";
import { useEffect, useState, type DragEvent, type ReactNode } from "react";

const ORDER_STORAGE_KEY = "trader:paper-bot-order-v2";
const COLLAPSED_STORAGE_KEY = "trader:paper-bot-collapsed-v1";

export interface PaperBotDockItem {
  id: string;
  label: string;
  collapsible?: boolean;
  node: ReactNode;
}

interface PaperBotDockProps {
  bots: PaperBotDockItem[];
}

export function PaperBotDock({ bots }: PaperBotDockProps) {
  const botIds = bots.map((bot) => bot.id);
  const botIdsKey = botIds.join("|");
  const [order, setOrder] = useState<string[]>(() => loadOrder(botIds));
  const [collapsedIds, setCollapsedIds] = useState<string[]>(loadCollapsed);
  const [draggingId, setDraggingId] = useState<string>();

  useEffect(() => {
    const availableIds = botIdsKey ? botIdsKey.split("|") : [];
    setOrder((current) => reconcileOrder(current, availableIds));
    setCollapsedIds((current) => current.filter((id) => availableIds.includes(id)));
  }, [botIdsKey]);

  useEffect(() => {
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedIds));
  }, [collapsedIds]);

  const orderedBots = order
    .map((id) => bots.find((bot) => bot.id === id))
    .filter((bot): bot is PaperBotDockItem => Boolean(bot));

  function moveBot(id: string, offset: number) {
    setOrder((current) => {
      const index = current.indexOf(id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(undefined);
    if (!sourceId || sourceId === targetId) return;
    setOrder((current) => {
      const sourceIndex = current.indexOf(sourceId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  return (
    <section className="paper-bot-dock" aria-label="Virtual bot dock">
      <header className="paper-bot-dock-heading">
        <div>
          <strong>Virtual bot dock</strong>
          <span>Paper-only strategies and operator tools</span>
        </div>
        <span>{orderedBots.length} bots</span>
      </header>
      {orderedBots.map((bot, index) => (
        <section
          className={`paper-bot-slot ${draggingId === bot.id ? "dragging" : ""}`}
          key={bot.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, bot.id)}
        >
          <div className="paper-bot-order-bar">
            <span
              className="paper-bot-drag-handle"
              draggable
              title="Drag to reorder bot"
              aria-label={`Drag to reorder ${bot.label}`}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", bot.id);
                setDraggingId(bot.id);
              }}
              onDragEnd={() => setDraggingId(undefined)}
            >
              <GripVertical size={14} />
              <strong>{bot.label}</strong>
            </span>
            <span className="paper-bot-order-actions">
              {bot.collapsible && (
                <button
                  className="icon-button compact-icon paper-bot-collapse-button"
                  type="button"
                  title={collapsedIds.includes(bot.id) ? "Expand bot" : "Fold bot"}
                  aria-label={collapsedIds.includes(bot.id) ? `Expand ${bot.label}` : `Fold ${bot.label}`}
                  aria-expanded={!collapsedIds.includes(bot.id)}
                  onClick={() => setCollapsedIds((current) => current.includes(bot.id) ? current.filter((id) => id !== bot.id) : [...current, bot.id])}
                >
                  {collapsedIds.includes(bot.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
              <button
                className="icon-button compact-icon"
                type="button"
                title="Move bot up"
                aria-label={`Move ${bot.label} up`}
                disabled={index === 0}
                onClick={() => moveBot(bot.id, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="icon-button compact-icon"
                type="button"
                title="Move bot down"
                aria-label={`Move ${bot.label} down`}
                disabled={index === orderedBots.length - 1}
                onClick={() => moveBot(bot.id, 1)}
              >
                <ChevronDown size={14} />
              </button>
            </span>
          </div>
          {(!bot.collapsible || !collapsedIds.includes(bot.id)) && bot.node}
        </section>
      ))}
    </section>
  );
}

function loadOrder(availableIds: string[]): string[] {
  try {
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    if (!stored) return availableIds;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return availableIds;
    return reconcileOrder(
      parsed.filter((value): value is string => typeof value === "string"),
      availableIds
    );
  } catch {
    return availableIds;
  }
}

function loadCollapsed(): string[] {
  try {
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function reconcileOrder(current: string[], availableIds: string[]): string[] {
  const retained = current.filter((id) => availableIds.includes(id));
  const additions = availableIds.filter((id) => !retained.includes(id));
  return [...retained, ...additions];
}
