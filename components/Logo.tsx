import Link from "next/link";
import { Layers, Percent } from "lucide-react";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md">
        <Layers className="size-[18px]" />
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-background">
          <Percent className="size-2.5" />
        </span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-base font-bold tracking-tight">
          DealStack{" "}
          <span className="text-emerald-600 dark:text-emerald-400">AU</span>
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground">
          STACK EVERY SAVING
        </span>
      </span>
    </Link>
  );
}

export default Logo;
