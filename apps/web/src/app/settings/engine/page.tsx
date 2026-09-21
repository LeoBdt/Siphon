import { UpdateCard, YtdlpCard } from "@/components/settings/cards";

/**
 * Two different things kept apart on purpose: yt-dlp updates itself inside the
 * running container, while a new Siphon means recreating the container. Mixing
 * them into one "updates" card would suggest a single button could do both.
 */
export default function EngineSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <YtdlpCard />
      <UpdateCard />
    </div>
  );
}
