import { PawPrint } from '@/lib/icons'

interface GenerateUnavailableProps {
  /** Kept for the upstream call site; Somnus has no image-key setup path to open. */
  onSetup?: () => void
}

// Somnus: hatching a custom pet needs a reference-capable image provider, and Somnus
// only runs through the Somnus account (no third-party keys). Instead of a dead-end
// "set up image generation" button (it pointed at a Providers tab Somnus replaces),
// say what is available today: Luna, the bundled pet, and the pet gallery.
export function GenerateUnavailable(_props: GenerateUnavailableProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
        <PawPrint className="size-5" />
      </span>
      <div className="space-y-1.5">
        <p className="text-[length:var(--conversation-text-font-size)] font-semibold">Custom pets are coming soon</p>
        <p className="mx-auto max-w-[19rem] text-[length:var(--conversation-caption-font-size)] leading-relaxed text-(--ui-text-tertiary)">
          Somnus comes with Luna, the Somnus moon. To pick another pet, open the command palette and search
          “Pets”.
        </p>
      </div>
    </div>
  )
}
