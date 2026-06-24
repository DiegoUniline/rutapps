import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      duration={2000}
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={{
        // Respeta el área segura del móvil (notch/barra de estado) para que
        // los toasts no queden tapados por la barra superior.
        ['--safe-area-inset-top' as any]: 'env(safe-area-inset-top, 0px)',
        top: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
      } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />

  );
};

export { Toaster, toast };
