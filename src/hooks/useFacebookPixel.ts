import { useEffect } from 'react';

const PIXEL_ID = '1465010795174663';

export function useFacebookPixel() {
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    // If already loaded, just track PageView
    if ((window as any).fbq) {
      (window as any).fbq('track', 'PageView');
      return;
    }

    // Inject the pixel base script
    const script = document.createElement('script');
    script.text = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${PIXEL_ID}');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(script);

    // Inject noscript fallback
    const noscript = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`;
    noscript.appendChild(img);
    document.body.appendChild(noscript);

    return () => {
      // Cleanup on unmount (optional, but good for SPA behavior)
      script.remove();
      noscript.remove();
    };
  }, []);
}
