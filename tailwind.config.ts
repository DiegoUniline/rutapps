import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Lato', 'system-ui', 'sans-serif'],
        serif: ['EB Garamond', 'Georgia', 'serif'],
        mono: ['Fira Code', 'monospace'],
      },
      fontSize: {
        'xxs': '11px',
        'xs': '12px',
        'sm': '13px',
        'base': '13px',
        'lg': '15px',
        'xl': '17px',
        '2xl': '20px',
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          hover: "hsl(var(--sidebar-hover))",
          accent: "hsl(var(--sidebar-accent))",
          muted: "hsl(var(--sidebar-muted))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        "brand-orange": {
          DEFAULT: "hsl(var(--brand-orange))",
          foreground: "hsl(var(--brand-orange-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        teal: {
          DEFAULT: "hsl(var(--teal))",
          foreground: "hsl(var(--teal-foreground))",
        },
        violet: {
          DEFAULT: "hsl(var(--violet))",
          foreground: "hsl(var(--violet-foreground))",
        },
        pink: {
          DEFAULT: "hsl(var(--pink))",
          foreground: "hsl(var(--pink-foreground))",
        },
        'table-header': "hsl(var(--table-header))",
        'table-hover': "hsl(var(--table-hover))",
        'table-border': "hsl(var(--table-border))",
        chart: {
          '1': "hsl(var(--chart-1))",
          '2': "hsl(var(--chart-2))",
          '3': "hsl(var(--chart-3))",
          '4': "hsl(var(--chart-4))",
          '5': "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        '2xs': "var(--shadow-2xs)",
        'xs': "var(--shadow-xs)",
        'sm': "var(--shadow-sm)",
        'md': "var(--shadow-md)",
        'lg': "var(--shadow-lg)",
        'xl': "var(--shadow-xl)",
        '2xl': "var(--shadow-2xl)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        underlineGrow: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "breathe-glow": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%":      { opacity: "0.9",  transform: "scale(1.08)" },
        },
        "pulse-cta": {
          "0%, 100%": { boxShadow: "0 10px 30px -10px rgba(0,96,232,0.55), 0 0 0 0 rgba(0,96,232,0.45)" },
          "50%":      { boxShadow: "0 14px 38px -10px rgba(0,96,232,0.65), 0 0 0 10px rgba(0,96,232,0)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2.2s infinite",
        "breathe-glow": "breathe-glow 7s ease-in-out infinite",
        "pulse-cta":    "pulse-cta 2.6s ease-in-out infinite",
        "float-slow":   "float-slow 5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
