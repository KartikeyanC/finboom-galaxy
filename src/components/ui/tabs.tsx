import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // height hugs the triggers (no fixed h-12 that left a big gap above/below the active pill); thin even track
      "inline-flex items-center justify-center rounded-full bg-background border border-border/50 p-1 text-muted-foreground shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // transparent border on every state so the box size never changes between active/inactive (prevents misalignment)
      "inline-flex items-center justify-center whitespace-nowrap rounded-full border border-transparent px-4 py-1.5 text-sm font-medium leading-none ring-offset-background transition-all",
      // inactive
      "text-muted-foreground hover:text-foreground hover:bg-primary/8",
      // BUG-094 — the active pill used to be a translucent green tint
      // (`bg-primary/15`) with matching-hue text (`text-primary`) on top: the
      // same colour twice at different opacities, which reads fine to the eye
      // but measures badly, because its contrast depends on whatever is
      // composited underneath. It landed anywhere from 4.19:1 to 4.44:1 across
      // the app's various tab bars — always close, never reliably over 4.5,
      // because the effective background shifted with whatever page it sat on.
      // A solid fill sidesteps that: `--primary` on `--primary-foreground` is
      // a fixed pair with a verified ratio (see the `--primary` note in
      // index.css), so it clears AA the same way everywhere this component is
      // used, rather than passing or failing per page by chance.
      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
