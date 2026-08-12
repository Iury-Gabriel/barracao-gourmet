import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Tema do painel. Escuro e o padrao (defaultTheme="dark"); o operador pode
 * alternar para o claro e a escolha fica salva no localStorage.
 * enableSystem={false}: o sistema operacional NAO manda no tema — se mandasse,
 * quem usa Windows no claro abriria o painel no claro, contrariando o padrao.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="barracao-tema"
    >
      {children}
    </NextThemesProvider>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme !== "light";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={escuro ? "Mudar para tema claro" : "Mudar para tema escuro"}
          onClick={() => setTheme(escuro ? "light" : "dark")}
          className={cn("h-8 w-8 flex-shrink-0", className)}
        >
          {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{escuro ? "Tema claro" : "Tema escuro"}</TooltipContent>
    </Tooltip>
  );
}
