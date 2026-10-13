"use client"

import {useSyncExternalStore} from "react"
const subscribe=(notify:()=>void)=>{const observer=new MutationObserver(notify);observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-color-mode"]});return()=>observer.disconnect();};
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme=useSyncExternalStore(subscribe,()=>document.documentElement.dataset.colorMode==="dark"?"dark":"light",()=>"light")

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
