import { site } from '@wix/site';
import { createClient } from '@wix/sdk';
import { currentCart } from '@wix/ecom';
import { location } from '@wix/site-location';
import { site as wixSite } from '@wix/site-site';
import { seo } from '@wix/site-seo';
import { ecom } from '@wix/site-ecom';

type WixClientModules = {
  currentCart: typeof currentCart;
  location: typeof location;
  wixSite: typeof wixSite;
  seo: typeof seo;
  ecom: typeof ecom;
  fetchWithAuth(url: string, init?: RequestInit): Promise<Response>;
  auth: { getAccessTokenInjector(): (url: string, init: RequestInit) => Promise<RequestInit> };
};

export const wixClient = createClient({
  host: site.host({ applicationId: 'babb660e-2e47-4ffe-b8e0-f1a990c6cc21' }),
  auth: site.auth(),
  modules: { currentCart, location, wixSite, seo, ecom },
}) as unknown as WixClientModules;
