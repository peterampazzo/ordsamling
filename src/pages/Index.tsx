import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, BookOpen, ArrowDownAZ, Clock, Plus, Upload, Brain, X, Filter, Settings as SettingsIcon, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useLexicon } from "@/hooks/useLexicon";
import { AddEntryForm } from "@/components/AddEntryForm";
import { LexisCard } from "@/components/LexisCard";
import { SettingsDialog } from "@/components/SettingsDialog";
import { isDemoMode } from "@/lib/demo";
import type { LexisEntry } from "@/hooks/useLexicon";
import { ENTRY_TYPES, entryTypeLabel, type EntryType } from "@/lib/lexicon";
import { t } from "@/i18n";

type SortMode = "newest" | "alpha";

const sortEntries = (entries: LexisEntry[], mode: SortMode) => {
  const sorted = [...entries];
  switch (mode) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case "alpha":
      return sorted.sort((a, b) => (a.danish || a.english).localeCompare(b.danish || b.english, "da"));
  }
};

const SORT_OPTIONS: { value: SortMode; labelKey: string; descKey: string; icon: typeof Clock }[] = [
  { value: "newest", labelKey: "index.sortNewest", descKey: "index.sortNewestDesc", icon: Clock },
  { value: "alpha", labelKey: "index.sortAlpha", descKey: "index.sortAlphaDesc", icon: ArrowDownAZ },
];

const Index = () => {
  const {
    entries,
    allEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    deleteEntry,
    findMatches,
    findLinkedWords,
    isLoading,
    isSaving,
  } = useLexicon();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>("alpha");
  const [typeFilters, setTypeFilters] = useState<Set<EntryType>>(new Set());
  const demo = isDemoMode();

  const toggleTypeFilter = (type: EntryType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filtered = useMemo(
    () => typeFilters.size === 0 ? entries : entries.filter((e) => typeFilters.has(e.type)),
    [entries, typeFilters],
  );

  const sorted = useMemo(() => sortEntries(filtered, sort), [filtered, sort]);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const groups = useMemo(() => {
    if (sort !== "alpha") return null;
    const map = new Map<string, LexisEntry[]>();
    for (const e of sorted) {
      const word = (e.danish || e.english || "").trim();
      const ch = word.charAt(0).toLocaleUpperCase("da");
      const letter = /[A-ZÆØÅ]/.test(ch) ? ch : "#";
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(e);
    }
    return Array.from(map.entries());
  }, [sorted, sort]);

  const ALPHABET = useMemo(
    () => ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","Æ","Ø","Å"],
    [],
  );
  const presentLetters = useMemo(
    () => new Set(groups?.map(([l]) => l) ?? []),
    [groups],
  );

  const jumpTo = (letter: string) => {
    const el = sectionRefs.current[letter];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-3xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-5 w-5 text-primary shrink-0" aria-hidden />
              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{t("index.title")}</h1>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums mr-1" title={t("common.wordCount", { count: allEntries.length })}>
                {t("common.wordCount", { count: allEntries.length })}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setSettingsOpen(true)}
                aria-label={t("settings.title")}
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                asChild
                aria-label="GitHub"
              >
                <a href="https://github.com/peterampazzo/ordsamling/" target="_blank" rel="noreferrer">
                  <Github className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 py-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search")}
                className="h-9 pl-9 pr-8 text-sm"
                aria-label={t("index.searchLabel")}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t("common.clearSearch")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 h-9 w-9 p-0"
              asChild
              aria-label={t("index.quizLabel")}
            >
              <Link to="/quiz">
                <Brain className="h-4 w-4" />
              </Link>
            </Button>
            {demo ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0">
                    <Button type="button" size="sm" variant="outline" className="shrink-0 h-9 w-9 p-0 opacity-50" disabled aria-label={t("index.importLabel")}>
                      <Upload className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("demo.addDisabled")}</TooltipContent>
              </Tooltip>
            ) : (
              <Button type="button" size="sm" variant="outline" className="shrink-0 h-9 w-9 p-0" asChild aria-label={t("index.importLabel")}>
                <Link to="/import">
                  <Upload className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {demo ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 gap-1.5 h-9 px-3 opacity-50"
                      disabled
                      aria-label={t("index.addWord")}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">{t("common.add")}</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("demo.addDisabled")}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5 h-9 px-3"
                onClick={() => setAddFormOpen(true)}
                disabled={isSaving}
                aria-haspopup="dialog"
                aria-expanded={addFormOpen}
                aria-label={t("index.addWord")}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t("common.add")}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 pb-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0 mr-0.5">
                {t("common.sort")}
              </span>
              {SORT_OPTIONS.map(({ value, labelKey, descKey, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  aria-pressed={sort === value}
                  title={t(descKey)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                    sort === value
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-secondary/80 text-secondary-foreground border-border hover:border-primary/40"
                  }`}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  {t(labelKey)}
                </button>
              ))}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                    typeFilters.size > 0
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-secondary/80 text-secondary-foreground border-border hover:border-primary/40"
                  }`}
                >
                  <Filter className="h-3 w-3 shrink-0" aria-hidden />
                  {t("common.filter")}
                  {typeFilters.size > 0 && (
                    <span className="ml-0.5 bg-primary-foreground/20 rounded-full px-1.5 text-[10px]">
                      {typeFilters.size}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-2">
                <div className="space-y-1">
                  {ENTRY_TYPES.map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={typeFilters.has(type)}
                        onCheckedChange={() => toggleTypeFilter(type)}
                      />
                      <span className="capitalize">{entryTypeLabel(type)}</span>
                    </label>
                  ))}
                  {typeFilters.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setTypeFilters(new Set())}
                      className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 mt-1 border-t border-border"
                    >
                      {t("common.clear")}
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

        </div>
      </header>

      <Dialog open={addFormOpen} onOpenChange={setAddFormOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 border-0 bg-background p-0 shadow-none rounded-none overflow-hidden",
            "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
          )}
        >
          <DialogTitle className="sr-only">{t("index.addWord")}</DialogTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="mx-auto w-full max-w-3xl">
              <AddEntryForm
                onAdd={addEntry}
                onCancel={() => setAddFormOpen(false)}
                onEdit={(id) => {
                  setEditingId(id);
                  setAddFormOpen(false);
                }}
                findMatches={findMatches}
                disabled={isSaving}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-base">{t("index.loadingWords")}</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {allEntries.length === 0 ? (
              <>
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-base">{t("index.noWordsYet")}</p>
                <p className="text-sm mt-1">{t("index.noWordsHint")}</p>
              </>
            ) : (
              <p>{t("common.noResults", { query: search || (typeFilters.size > 0 ? [...typeFilters].map(entryTypeLabel).join(", ") : "") })}</p>
            )}
          </div>
        ) : sort === "alpha" && groups ? (
          <>
            <nav
              aria-label="Jump to letter"
              className="sticky top-[148px] z-20 -mx-3 sm:-mx-4 mb-3 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b border-border"
            >
              <div className="flex gap-px px-2 sm:px-3 py-1.5 overflow-x-auto no-scrollbar">
                {ALPHABET.map((l) => {
                  const has = presentLetters.has(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={!has}
                      onClick={() => jumpTo(l)}
                      className={cn(
                        "h-5 min-w-[18px] px-0.5 text-[10px] font-mono tabular-nums rounded transition-colors shrink-0",
                        has
                          ? "text-foreground hover:bg-primary hover:text-primary-foreground"
                          : "text-muted-foreground/30 cursor-default",
                      )}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="space-y-6">
              {groups.map(([letter, items]) => (
                <section
                  key={letter}
                  ref={(el) => { sectionRefs.current[letter] = el; }}
                  aria-label={`Section ${letter}`}
                  className="scroll-mt-[200px]"
                >
                  <h2 className="sticky top-[196px] z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 font-serif text-2xl text-foreground py-1 mb-2 border-b border-border">
                    {letter}
                  </h2>
                  <div className="space-y-3">
                    {items.map((entry) => (
                      <LexisCard
                        key={entry.id}
                        entry={entry}
                        onUpdate={updateEntry}
                        onDelete={deleteEntry}
                        linkedWords={findLinkedWords(entry)}
                        startEditing={editingId === entry.id}
                        onEditingDone={() => setEditingId(null)}
                        disabled={isSaving}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {sorted.map((entry) => (
              <LexisCard
                key={entry.id}
                entry={entry}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                linkedWords={findLinkedWords(entry)}
                startEditing={editingId === entry.id}
                onEditingDone={() => setEditingId(null)}
                disabled={isSaving}
              />
            ))}
          </div>
        )}
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} entries={allEntries} />
    </div>
  );
};

export default Index;
