import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";



function datePart(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.split("T")[0];
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseCalendarDate(value: unknown): Date {
  const part = datePart(value);
  const match = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return new Date(value as string);
}

function addMonthsDatePart(value: unknown, months: number): string {
  const d = parseCalendarDate(value || new Date());
  d.setMonth(d.getMonth() + months);
  return datePart(d);
}

function addDaysDatePart(value: unknown, days: number): string {
  const part = datePart(value);
  const match = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return d.toISOString().slice(0, 10);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// RutApp Stripe product IDs
const RUTAPP_PRODUCT_IDS = new Set([
  "prod_U9a56wjBGbKv4B", // Mensual
  "prod_U9a6TsdjaGp99L", // Semestral
  "prod_U9a7Ap6nbM6kPV", // Anual
]);

function getProductId(product: unknown): string | null {
  if (!product) return null;
  if (typeof product === "string") return product;
  if (typeof product === "object" && product !== null && "id" in product) {
    const id = (product as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function isRutappSubscription(sub: any): boolean {
  return (sub?.items?.data || []).some((item: any) => {
    const productId = getProductId(item?.price?.product);
    return productId ? RUTAPP_PRODUCT_IDS.has(productId) : false;
  });
}

function isRutappInvoice(inv: any): boolean {
  // Match invoices created manually (have empresa_id in metadata)
  if (inv?.metadata?.empresa_id) return true;
  if (!inv?.lines?.data?.length) return false;
  return inv.lines.data.some((line: any) => {
    const productId = getProductId(line?.price?.product);
    return productId ? RUTAPP_PRODUCT_IDS.has(productId) : false;
  });
}

function getCustomerId(customer: unknown): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && customer !== null && "id" in customer) {
    const id = (customer as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function getStripeObjectId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function stripeTimestamp(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function compactStripeInvoice(invoice: any) {
  if (!invoice) return null;
  const remaining = typeof invoice.amount_remaining === "number"
    ? invoice.amount_remaining
    : Math.max(0, Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0));
  const trulyPaid = remaining === 0 && Number(invoice.amount_paid || 0) > 0;
  const amountDue = Number(invoice.amount_due ?? invoice.total ?? invoice.amount_paid ?? 0);
  const amountPaid = Number(invoice.amount_paid || 0);
  return {
    id: invoice.id,
    number: invoice.number || null,
    status: trulyPaid ? "paid" : (invoice.status || "open"),
    amount: amountDue / 100,
    amount_due: amountDue / 100,
    amount_paid: amountPaid / 100,
    amount_remaining: Math.max(0, remaining) / 100,
    paid_at: trulyPaid
      ? stripeTimestamp(invoice.status_transitions?.paid_at || invoice.created)
      : null,
    created_at: stripeTimestamp(invoice.created),
    period_start: stripeTimestamp(invoice.period_start),
    period_end: stripeTimestamp(invoice.period_end),
    stripe_invoice_id: invoice.id,
  };
}

function compactLocalInvoice(invoice: any) {
  if (!invoice) return null;
  const amount = Number(invoice.total || 0);
  const paid = String(invoice.estado || "").toLowerCase() === "pagada";
  return {
    id: invoice.id,
    number: invoice.numero_factura || null,
    status: invoice.estado || "pendiente",
    amount,
    amount_due: amount,
    amount_paid: paid ? amount : 0,
    amount_remaining: paid ? 0 : amount,
    paid_at: invoice.fecha_pago || null,
    created_at: invoice.fecha_emision || invoice.creado_en || null,
    period_start: invoice.periodo_inicio || null,
    period_end: invoice.periodo_fin || null,
    es_prorrateo: invoice.es_prorrateo === true,
    stripe_invoice_id: invoice.stripe_invoice_id || null,
  };
}

function compactCard(paymentMethod: any) {
  const card = paymentMethod?.card;
  if (!card?.last4) return null;
  return {
    brand: card.brand || "card",
    last4: card.last4,
    exp_month: Number(card.exp_month || 0),
    exp_year: Number(card.exp_year || 0),
    funding: card.funding || null,
  };
}

function relationOne(value: any): any | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function stripeBillableSeats(stripeSub: any, plan: any, legacyPricing = false): number {
  if (!stripeSub) return 0;
  if (plan?.slug && plan?.stripe_price_id_extra && !legacyPricing) {
    const baseItem = stripeSub.items?.data?.find((item: any) => getStripeObjectId(item.price) === plan.stripe_price_id);
    const extraItem = stripeSub.items?.data?.find((item: any) => getStripeObjectId(item.price) === plan.stripe_price_id_extra);
    if (baseItem) return Number(plan.usuarios_incluidos || 0) + Number(extraItem?.quantity || 0);
  }
  return Number(stripeSub.items?.data?.[0]?.quantity || 0);
}

async function listAllStripeSubscriptions(stripe: Stripe): Promise<any[]> {
  const rows: any[] = [];
  let startingAfter: string | undefined;
  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ["data.default_payment_method", "data.customer"],
    });
    rows.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return rows;
}

async function listAllStripeInvoices(stripe: Stripe): Promise<any[]> {
  const rows: any[] = [];
  let startingAfter: string | undefined;
  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    const page = await stripe.invoices.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    rows.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return rows;
}

async function resolveSubscriptionCard(
  stripe: Stripe,
  stripeSub: any,
  dbPaymentMethodId?: string | null,
) {
  if (!stripeSub) return { payment_method_id: dbPaymentMethodId || null, card: null };

  const customer = typeof stripeSub.customer === "object" ? stripeSub.customer : null;
  const candidates = [
    stripeSub.default_payment_method,
    customer?.invoice_settings?.default_payment_method,
    dbPaymentMethodId,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const id = getStripeObjectId(candidate);
    const embeddedCard = compactCard(candidate);
    if (embeddedCard) return { payment_method_id: id, card: embeddedCard };
    if (id?.startsWith("pm_")) {
      try {
        const method = await stripe.paymentMethods.retrieve(id);
        const card = compactCard(method);
        if (card) return { payment_method_id: id, card };
      } catch (_) { /* continuar con el siguiente origen */ }
    }
  }

  const customerId = getCustomerId(stripeSub.customer);
  if (customerId) {
    try {
      const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 10 });
      const method = methods.data[0];
      if (method) return { payment_method_id: method.id, card: compactCard(method) };
    } catch (_) { /* cliente sin PaymentMethods modernos */ }

    try {
      const stripeCustomer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in stripeCustomer && stripeCustomer.deleted)) {
        const sourceId = getStripeObjectId((stripeCustomer as any).default_source);
        if (sourceId) {
          const source = await stripe.customers.retrieveSource(customerId, sourceId);
          const sourceCard = (source as any)?.object === "card" ? source : null;
          if (sourceCard?.last4) {
            return {
              payment_method_id: sourceId,
              card: {
                brand: sourceCard.brand || "card",
                last4: sourceCard.last4,
                exp_month: Number(sourceCard.exp_month || 0),
                exp_year: Number(sourceCard.exp_year || 0),
                funding: sourceCard.funding || null,
              },
            };
          }
        }
      }
    } catch (_) { /* no exponer un fallo de tarjeta como fallo del endpoint */ }
  }

  return { payment_method_id: getStripeObjectId(stripeSub.default_payment_method) || dbPaymentMethodId || null, card: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Verify super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No autenticado");

    const { data: sa } = await supabase
      .from("super_admins")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!sa) throw new Error("No autorizado — solo super admin");

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    async function syncSubscriptionSeatsForEmpresa(empresaId: string) {
      const [subscriptionRes, activeProfilesRes] = await Promise.all([
        supabase.from("subscriptions")
          .select("id, empresa_id, max_usuarios, stripe_subscription_id, plan_id, legacy_pricing, subscription_plans(slug, usuarios_incluidos, stripe_price_id, stripe_price_id_extra)")
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase.from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", empresaId)
          .eq("estado", "activo")
          .is("archivado_en", null),
      ]);
      if (subscriptionRes.error) throw subscriptionRes.error;
      if (activeProfilesRes.error) throw activeProfilesRes.error;
      const localSub = subscriptionRes.data as any;
      if (!localSub) throw new Error("La empresa no tiene suscripción");

      const plan = relationOne(localSub.subscription_plans);
      const activeUsers = Number(activeProfilesRes.count || 0);
      const minimumUsers = plan?.usuarios_incluidos != null
        ? Math.max(1, Number(plan.usuarios_incluidos || 0))
        : 3;
      const expectedUsers = Math.max(minimumUsers, activeUsers);
      let previousStripeUsers = 0;

      if (localSub.stripe_subscription_id) {
        const stripeSub = await stripe.subscriptions.retrieve(localSub.stripe_subscription_id);
        previousStripeUsers = stripeBillableSeats(stripeSub, plan, localSub.legacy_pricing === true);
        const isTwoItem = Boolean(plan?.slug && plan?.stripe_price_id_extra && localSub.legacy_pricing !== true);
        const items: any[] = [];

        if (isTwoItem) {
          const baseItem = stripeSub.items.data.find((item: any) => getStripeObjectId(item.price) === plan.stripe_price_id);
          const extraItem = stripeSub.items.data.find((item: any) => getStripeObjectId(item.price) === plan.stripe_price_id_extra);
          if (!baseItem) throw new Error("No se encontró el renglón base de la suscripción en Stripe");
          items.push({ id: baseItem.id, quantity: 1 });
          const desiredExtras = Math.max(0, expectedUsers - Number(plan.usuarios_incluidos || 0));
          if (extraItem) {
            items.push(desiredExtras === 0
              ? { id: extraItem.id, deleted: true }
              : { id: extraItem.id, quantity: desiredExtras });
          } else if (desiredExtras > 0) {
            items.push({ price: plan.stripe_price_id_extra, quantity: desiredExtras });
          }
        } else {
          const item = stripeSub.items.data[0];
          if (!item) throw new Error("No se encontró el renglón de la suscripción en Stripe");
          items.push({ id: item.id, quantity: expectedUsers });
        }

        if (previousStripeUsers !== expectedUsers || stripeSub.metadata?.num_usuarios !== String(expectedUsers)) {
          await stripe.subscriptions.update(localSub.stripe_subscription_id, {
            items,
            proration_behavior: "none",
            metadata: { ...stripeSub.metadata, num_usuarios: String(expectedUsers) },
          });
        }
      }

      const { error: updateError } = await supabase.from("subscriptions")
        .update({
          max_usuarios: expectedUsers,
          stripe_sync_error: null,
          stripe_sync_error_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localSub.id);
      if (updateError) throw updateError;

      return {
        empresa_id: empresaId,
        active_users: activeUsers,
        minimum_users: minimumUsers,
        previous_stripe_users: previousStripeUsers,
        stripe_users: expectedUsers,
        changed: previousStripeUsers !== expectedUsers || Number(localSub.max_usuarios || 0) !== expectedUsers,
      };
    }

    if (action === "list_all_invoices") {
      const statusFilter = url.searchParams.get("status") || "all"; // 'paid' | 'open' | 'all'
      const empresaIdParam = url.searchParams.get("empresa_id");

      // FAST PATH: si nos piden una empresa específica, solo traemos sus invoices
      // (por customer_id de subscriptions/facturas) en lugar de toda la plataforma.
      if (empresaIdParam) {
        const [subRes, factsRes, empRes] = await Promise.all([
          supabase.from("subscriptions").select("stripe_customer_id").eq("empresa_id", empresaIdParam).maybeSingle(),
          supabase.from("facturas").select("stripe_invoice_id").eq("empresa_id", empresaIdParam),
          supabase.from("empresas").select("id, nombre, email, owner_user_id").eq("id", empresaIdParam).maybeSingle(),
        ]);
        const customerIds = new Set<string>();
        if (subRes.data?.stripe_customer_id) customerIds.add(subRes.data.stripe_customer_id);
        const localInvoiceIds = new Set<string>((factsRes.data || []).map((f: any) => f.stripe_invoice_id).filter(Boolean));

        const collected: any[] = [];
        for (const cid of customerIds) {
          try {
            const params: any = { customer: cid, limit: 100, expand: ["data.lines.data.price"] };
            if (statusFilter !== "all") params.status = statusFilter;
            const page = await stripe.invoices.list(params);
            collected.push(...page.data);
          } catch (_) { /* ignore */ }
        }
        // Traer también las que estén referenciadas en facturas (por si vinieron de otro customer)
        const haveIds = new Set(collected.map((i: any) => i.id));
        for (const id of localInvoiceIds) {
          if (!haveIds.has(id)) {
            try { collected.push(await stripe.invoices.retrieve(id, { expand: ["lines.data.price"] })); } catch (_) {}
          }
        }
        const empresa = empRes.data;
        const enriched = collected.map((inv: any) => ({
          ...inv,
          paid_at: inv.status_transitions?.paid_at || null,
          empresa_id: empresaIdParam,
          empresa_nombre: empresa?.nombre || null,
          empresa_email: empresa?.email || null,
        })).sort((a, b) => (b.created || 0) - (a.created || 0));

        return new Response(JSON.stringify({ invoices: enriched }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      // Paginate through ALL invoices (Stripe caps each page at 100)
      const allInvoices: any[] = [];
      let starting_after: string | undefined = undefined;
      for (let i = 0; i < 20; i++) { // safety cap: up to 2000 invoices
        const params: any = {
          limit: 100,
          expand: ["data.lines.data.price", "data.customer"],
        };
        if (starting_after) params.starting_after = starting_after;
        if (statusFilter !== "all") params.status = statusFilter;
        const page = await stripe.invoices.list(params);
        allInvoices.push(...page.data);
        if (!page.has_more || page.data.length === 0) break;
        starting_after = page.data[page.data.length - 1].id;
      }

      // NOTE: We intentionally do NOT filter by isRutappInvoice here.
      // The Stripe account is dedicated to Rutapp; older invoices created via
      // Checkout/Customer Portal lack metadata.empresa_id, so filtering would
      // exclude legitimate paid invoices. Show them all.
      const rutappInvoices = allInvoices;

      // Resolve empresa info via 4 strategies (in priority order):
      // 1. metadata.empresa_id on the invoice
      // 2. facturas.stripe_invoice_id -> empresa_id
      // 3. subscriptions.stripe_customer_id -> empresa_id
      // 4. empresas.email matches customer email
      const empresaIdsFromMeta = new Set<string>();
      const stripeInvoiceIds = new Set<string>();
      const stripeCustomerIds = new Set<string>();
      const emails = new Set<string>();
      for (const inv of rutappInvoices) {
        const eid = inv?.metadata?.empresa_id;
        if (eid) empresaIdsFromMeta.add(eid);
        if (inv.id) stripeInvoiceIds.add(inv.id);
        const cust: any = inv.customer;
        const custId = typeof cust === "string" ? cust : cust?.id;
        if (custId) stripeCustomerIds.add(custId);
        const email = (typeof cust === "object" && cust?.email) || inv.customer_email;
        if (email) emails.add(String(email).toLowerCase());
      }

      // Lookup auth.users by emails to map -> owner_user_id -> empresa
      const emailsArr = [...emails];
      const { data: authUsersData } = emailsArr.length > 0
        ? await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
        : { data: { users: [] as any[] } } as any;
      const userIdByEmail: Record<string, string> = {};
      for (const u of (authUsersData?.users || [])) {
        if (u?.email) userIdByEmail[String(u.email).toLowerCase()] = u.id;
      }
      const ownerUserIds = [...new Set(Object.values(userIdByEmail))];

      const [empsByMetaRes, facturasRes, subsRes, empsByEmailRes, empsByOwnerRes] = await Promise.all([
        empresaIdsFromMeta.size > 0
          ? supabase.from("empresas").select("id, nombre, email, owner_user_id").in("id", [...empresaIdsFromMeta])
          : Promise.resolve({ data: [] as any[] }),
        stripeInvoiceIds.size > 0
          ? supabase.from("facturas").select("stripe_invoice_id, empresa_id").in("stripe_invoice_id", [...stripeInvoiceIds])
          : Promise.resolve({ data: [] as any[] }),
        stripeCustomerIds.size > 0
          ? supabase.from("subscriptions").select("stripe_customer_id, empresa_id").in("stripe_customer_id", [...stripeCustomerIds])
          : Promise.resolve({ data: [] as any[] }),
        emailsArr.length > 0
          ? supabase.from("empresas").select("id, nombre, email, owner_user_id")
              .or(emailsArr.map(e => `email.ilike.${e}`).join(","))
          : Promise.resolve({ data: [] as any[] }),
        ownerUserIds.length > 0
          ? supabase.from("empresas").select("id, nombre, email, owner_user_id").in("owner_user_id", ownerUserIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const allEmpresaIds = new Set<string>();
      for (const e of (empsByMetaRes.data || [])) if (e.id) allEmpresaIds.add(e.id);
      for (const f of (facturasRes.data || [])) if (f.empresa_id) allEmpresaIds.add(f.empresa_id);
      for (const s of (subsRes.data || [])) if (s.empresa_id) allEmpresaIds.add(s.empresa_id);
      for (const e of (empsByOwnerRes.data || [])) if (e.id) allEmpresaIds.add(e.id);

      const { data: allEmpresas } = allEmpresaIds.size > 0
        ? await supabase.from("empresas").select("id, nombre, email, owner_user_id").in("id", [...allEmpresaIds])
        : { data: [] as any[] };

      const empresaById: Record<string, { id: string; nombre: string; email: string | null; owner_user_id?: string | null }> = {};
      for (const e of (allEmpresas || [])) empresaById[e.id] = e as any;
      for (const e of (empsByOwnerRes.data || [])) empresaById[e.id] = e as any;

      const empresaByStripeInvoice: Record<string, string> = {};
      for (const f of (facturasRes.data || [])) {
        if (f.stripe_invoice_id && f.empresa_id) empresaByStripeInvoice[f.stripe_invoice_id] = f.empresa_id;
      }
      const empresaByStripeCustomer: Record<string, string> = {};
      for (const s of (subsRes.data || [])) {
        if (s.stripe_customer_id && s.empresa_id) empresaByStripeCustomer[s.stripe_customer_id] = s.empresa_id;
      }
      // Email -> empresa: by empresas.email (case-insensitive) AND by owner_user_id email
      const empresaByEmail: Record<string, { id: string; nombre: string; email: string | null }> = {};
      for (const e of (empsByEmailRes.data || [])) {
        if (e.email) empresaByEmail[String(e.email).toLowerCase()] = e as any;
      }
      for (const e of (empsByOwnerRes.data || [])) {
        const ownerEmail = Object.entries(userIdByEmail).find(([_, uid]) => uid === e.owner_user_id)?.[0];
        if (ownerEmail) empresaByEmail[ownerEmail] = e as any;
      }

      const mapped = rutappInvoices.map((inv) => {
        const cust: any = inv.customer;
        const custId = typeof cust === "string" ? cust : cust?.id;
        const custEmail = (typeof cust === "object" && cust?.email) || inv.customer_email || null;
        const custName = (typeof cust === "object" && cust?.name) || null;

        // Resolution chain: metadata -> factura -> subscription customer -> empresa email
        let resolvedId: string | null = inv?.metadata?.empresa_id || null;
        let matchedByDb = !!resolvedId;
        if (!resolvedId && inv.id && empresaByStripeInvoice[inv.id]) {
          resolvedId = empresaByStripeInvoice[inv.id]; matchedByDb = true;
        }
        if (!resolvedId && custId && empresaByStripeCustomer[custId]) {
          resolvedId = empresaByStripeCustomer[custId]; matchedByDb = true;
        }
        let empresa = resolvedId ? empresaById[resolvedId] : undefined;
        if (!empresa && custEmail) empresa = empresaByEmail[String(custEmail).toLowerCase()];

        // Decide if this is a Rutapp invoice (only Rutapp must show):
        // a) Linked in DB (metadata, facturas, subscriptions)
        // b) Product matches RUTAPP_PRODUCT_IDS
        // c) Description / lines / product name mention 'rutapp'
        const lineDesc = (inv.lines?.data || [])
          .map((l: any) => `${l?.description || ''} ${l?.price?.product?.name || ''} ${l?.plan?.nickname || ''}`)
          .join(' ').toLowerCase();
        const hasRutappText = lineDesc.includes('rutapp') || lineDesc.includes('rut app');
        const hasRutappProduct = (inv.lines?.data || []).some((l: any) => {
          const pid = getProductId(l?.price?.product);
          return pid ? RUTAPP_PRODUCT_IDS.has(pid) : false;
        });
        const isRutapp = matchedByDb || hasRutappProduct || hasRutappText;
        if (!isRutapp) return null;

        // Real payment status: amount_remaining === 0 AND amount_paid > 0 means truly paid
        const amountRemaining = typeof inv.amount_remaining === 'number' ? inv.amount_remaining : (inv.amount_due - (inv.amount_paid || 0));
        const trulyPaid = amountRemaining === 0 && (inv.amount_paid || 0) > 0;
        const realStatus = trulyPaid ? 'paid' : (inv.status || 'open');

        return {
          id: inv.id,
          number: inv.number,
          status: realStatus,
          stripe_status: inv.status,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          amount_remaining: amountRemaining,
          truly_paid: trulyPaid,
          currency: inv.currency,
          created: inv.created,
          due_date: inv.due_date,
          hosted_invoice_url: inv.hosted_invoice_url,
          invoice_pdf: inv.invoice_pdf,
          customer_email: custEmail,
          customer_name: custName,
          customer_id: custId || null,
          subscription_id: typeof inv.subscription === 'string' ? inv.subscription : (inv.subscription?.id || null),
          attempt_count: inv.attempt_count || 0,
          attempted: !!inv.attempted,
          next_payment_attempt: inv.next_payment_attempt || null,
          paid_at: inv.status_transitions?.paid_at || null,
          collection_method: inv.collection_method || null,
          billing_reason: inv.billing_reason || null,
          empresa_id: empresa?.id || resolvedId || null,
          empresa_nombre: empresa?.nombre || inv?.metadata?.empresa_nombre || null,
          description: inv.lines?.data?.[0]?.description || "Suscripción Rutapp",
        };

      }).filter((x): x is NonNullable<typeof x> => x !== null);

      // Sort by created desc
      mapped.sort((a, b) => (b.created || 0) - (a.created || 0));

      return new Response(JSON.stringify({ invoices: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_customers") {
      const [subsList, invoicesList] = await Promise.all([
        stripe.subscriptions.list({ limit: 100, status: "all" }),
        stripe.invoices.list({ limit: 100, expand: ["data.lines.data.price"] }),
      ]);

      const customerIds = new Set<string>();
      subsList.data.filter(isRutappSubscription).forEach((sub) => {
        const customerId = getCustomerId(sub.customer);
        if (customerId) customerIds.add(customerId);
      });
      invoicesList.data.filter(isRutappInvoice).forEach((inv) => {
        const customerId = getCustomerId(inv.customer);
        if (customerId) customerIds.add(customerId);
      });

      const customerRecords = await Promise.all(
        [...customerIds].slice(0, 100).map((id) => stripe.customers.retrieve(id))
      );

      const mapped = customerRecords
        .filter((c: any) => !c?.deleted)
        .map((c: any) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          created: c.created,
        }));

      return new Response(JSON.stringify({ customers: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_subscriptions") {
      const subs = await stripe.subscriptions.list({ limit: 100, status: "all" });
      const rutappSubs = subs.data.filter(isRutappSubscription);

      const mapped = rutappSubs.map((s) => {
        const firstRutappItem = s.items.data.find((item) => {
          const productId = getProductId(item.price?.product);
          return productId ? RUTAPP_PRODUCT_IDS.has(productId) : false;
        });

        return {
          id: s.id,
          status: s.status,
          customer: s.customer,
          current_period_end: s.current_period_end,
          quantity: firstRutappItem?.quantity || 0,
          plan_amount: firstRutappItem?.price?.unit_amount || 0,
          product_id: firstRutappItem?.price?.product || null,
        };
      });

      return new Response(JSON.stringify({ subscriptions: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_subscription_seats") {
      const empresaId = String(body.empresa_id || "");
      if (!empresaId) throw new Error("empresa_id requerido");
      const result = await syncSubscriptionSeatsForEmpresa(empresaId);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_subscription_seats_bulk") {
      const empresaIds = [...new Set(
        (Array.isArray(body.empresa_ids) ? body.empresa_ids : [])
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean),
      )].slice(0, 250);
      if (!empresaIds.length) throw new Error("No se recibieron empresas para sincronizar");

      const results: any[] = [];
      for (let index = 0; index < empresaIds.length; index += 5) {
        const batch = empresaIds.slice(index, index + 5);
        const settled = await Promise.all(batch.map(async (empresaId) => {
          try {
            return { ok: true, ...(await syncSubscriptionSeatsForEmpresa(empresaId)) };
          } catch (error) {
            return {
              ok: false,
              empresa_id: empresaId,
              error: error instanceof Error ? error.message : "Error desconocido",
            };
          }
        }));
        results.push(...settled);
      }

      const successful = results.filter(result => result.ok);
      const failed = results.filter(result => !result.ok);
      return new Response(JSON.stringify({
        ok: failed.length === 0,
        requested: empresaIds.length,
        synchronized: successful.length,
        changed: successful.filter(result => result.changed).length,
        failed: failed.length,
        results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Auditoría de solo lectura: compara alta, trial, suscripción local, Stripe,
    // tarjeta e invoices. No actualiza ninguna tabla ni objeto de Stripe.
    if (action === "audit_subscriptions") {
      const [empresasRes, subscriptionsRes, facturasRes, allStripeSubscriptions, allStripeInvoices] = await Promise.all([
        supabase.from("empresas")
          .select("id, nombre, email, created_at, demo_expires_at, is_partner_sandbox")
          .order("created_at", { ascending: false }),
        supabase.from("subscriptions")
          .select("id, empresa_id, status, created_at, trial_ends_at, current_period_start, current_period_end, fecha_vencimiento, acceso_bloqueado, es_manual, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, stripe_payment_method_id, stripe_sync_error, max_usuarios, legacy_pricing, updated_at, subscription_plans(nombre, slug, usuarios_incluidos, stripe_price_id, stripe_price_id_extra)"),
        supabase.from("facturas")
          .select("id, empresa_id, suscripcion_id, numero_factura, concepto, estado, total, fecha_pago, fecha_emision, creado_en, periodo_inicio, periodo_fin, es_prorrateo, stripe_invoice_id"),
        listAllStripeSubscriptions(stripe),
        listAllStripeInvoices(stripe),
      ]);

      if (empresasRes.error) throw empresasRes.error;
      if (subscriptionsRes.error) throw subscriptionsRes.error;
      if (facturasRes.error) throw facturasRes.error;

      const empresas = empresasRes.data || [];
      const dbSubscriptions = (subscriptionsRes.data || []) as any[];
      const localInvoices = (facturasRes.data || []) as any[];
      const dbStripeIds = new Set(dbSubscriptions.map(s => s.stripe_subscription_id).filter(Boolean));
      const relevantStripeSubscriptions = allStripeSubscriptions.filter(s => dbStripeIds.has(s.id) || isRutappSubscription(s));

      // Suscripciones antiguas pueden usar productos que ya no están en la lista
      // vigente. Si la BD las referencia, se recuperan individualmente.
      const stripeById = new Map(relevantStripeSubscriptions.map(s => [s.id, s]));
      for (const stripeId of dbStripeIds) {
        if (stripeById.has(stripeId)) continue;
        try {
          const retrieved = await stripe.subscriptions.retrieve(stripeId, {
            expand: ["items.data.price.product", "default_payment_method", "customer"],
          });
          relevantStripeSubscriptions.push(retrieved);
          stripeById.set(retrieved.id, retrieved);
        } catch (_) { /* la vista reportará el ID local como inexistente en Stripe */ }
      }

      const dbByEmpresa = new Map<string, any[]>();
      for (const dbSub of dbSubscriptions) {
        const rows = dbByEmpresa.get(dbSub.empresa_id) || [];
        rows.push(dbSub);
        dbByEmpresa.set(dbSub.empresa_id, rows);
      }
      for (const rows of dbByEmpresa.values()) {
        rows.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
      }

      const localInvoicesByEmpresa = new Map<string, any[]>();
      for (const invoice of localInvoices) {
        const rows = localInvoicesByEmpresa.get(invoice.empresa_id) || [];
        rows.push(invoice);
        localInvoicesByEmpresa.set(invoice.empresa_id, rows);
      }
      for (const rows of localInvoicesByEmpresa.values()) {
        rows.sort((a, b) => new Date(b.fecha_emision || b.creado_en || 0).getTime() - new Date(a.fecha_emision || a.creado_en || 0).getTime());
      }

      const stripeInvoicesById = new Map(allStripeInvoices.map(inv => [inv.id, inv]));
      const claimedStripeIds = new Set<string>();
      const records: any[] = [];

      // Procesamiento por lotes para no saturar Stripe al resolver tarjetas.
      for (let offset = 0; offset < empresas.length; offset += 10) {
        const batch = empresas.slice(offset, offset + 10);
        const batchRecords = await Promise.all(batch.map(async empresa => {
          const dbRows = dbByEmpresa.get(empresa.id) || [];
          const dbSub = dbRows[0] || null;
          const exactStripeSub = dbSub?.stripe_subscription_id
            ? stripeById.get(dbSub.stripe_subscription_id) || null
            : null;
          const dbSubIdsForEmpresa = new Set(dbRows.map(row => row.stripe_subscription_id).filter(Boolean));
          const dbCustomerIdsForEmpresa = new Set(dbRows.map(row => row.stripe_customer_id).filter(Boolean));

          const stripeCandidates = relevantStripeSubscriptions.filter(stripeSub => {
            const customerId = getCustomerId(stripeSub.customer);
            return dbSubIdsForEmpresa.has(stripeSub.id)
              || (customerId && dbCustomerIdsForEmpresa.has(customerId))
              || stripeSub.metadata?.empresa_id === empresa.id;
          });
          const stripeSub = exactStripeSub
            || stripeCandidates.find(s => ["active", "trialing", "past_due"].includes(s.status))
            || stripeCandidates[0]
            || null;
          stripeCandidates.forEach(s => claimedStripeIds.add(s.id));

          const [payment, latestSaleRes, activeProfilesRes] = await Promise.all([
            resolveSubscriptionCard(stripe, stripeSub, dbSub?.stripe_payment_method_id),
            supabase.from("ventas")
              .select("id, folio, fecha, created_at, total, status")
              .eq("empresa_id", empresa.id)
              .eq("es_saldo_inicial", false)
              .in("status", ["confirmado", "entregado", "facturado"])
              .order("fecha", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("empresa_id", empresa.id)
              .eq("estado", "activo")
              .is("archivado_en", null),
          ]);
          const planInfo = relationOne(dbSub?.subscription_plans);
          const activeUsers = Number(activeProfilesRes.count || 0);
          const minimumUsers = planInfo?.usuarios_incluidos != null
            ? Math.max(1, Number(planInfo.usuarios_incluidos || 0))
            : 3;
          const expectedBillableUsers = Math.max(minimumUsers, activeUsers);
          const billedUsers = stripeBillableSeats(stripeSub, planInfo, dbSub?.legacy_pricing === true);
          const customerIds = new Set(stripeCandidates.map(s => getCustomerId(s.customer)).filter(Boolean));
          if (dbSub?.stripe_customer_id) customerIds.add(dbSub.stripe_customer_id);
          const candidateSubIds = new Set(stripeCandidates.map(s => s.id));
          if (dbSub?.stripe_subscription_id) candidateSubIds.add(dbSub.stripe_subscription_id);

          const stripeInvoices = allStripeInvoices
            .filter(invoice => {
              const subscriptionId = getStripeObjectId(invoice.subscription);
              const customerId = getCustomerId(invoice.customer);
              return invoice.metadata?.empresa_id === empresa.id
                || (subscriptionId && candidateSubIds.has(subscriptionId))
                || (customerId && customerIds.has(customerId));
            })
            .sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
          const paidStripeInvoices = stripeInvoices.filter(invoice => {
            const remaining = typeof invoice.amount_remaining === "number"
              ? invoice.amount_remaining
              : Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0);
            return remaining === 0 && Number(invoice.amount_paid || 0) > 0;
          });
          const outstandingStripeInvoices = stripeInvoices.filter(invoice => {
            const remaining = typeof invoice.amount_remaining === "number"
              ? invoice.amount_remaining
              : Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0);
            return remaining > 0 && !["draft", "void", "paid"].includes(String(invoice.status || "").toLowerCase());
          });

          const companyLocalInvoices = (localInvoicesByEmpresa.get(empresa.id) || []).filter(invoice => {
            if (invoice.suscripcion_id && dbRows.some(row => row.id === invoice.suscripcion_id)) return true;
            return !String(invoice.concepto || "").toLowerCase().includes("timbre");
          });
          const trialEndDate = datePart(empresa.demo_expires_at || dbSub?.trial_ends_at)
            || addDaysDatePart(empresa.created_at, 7);
          const firstBillableLocalInvoice = [...companyLocalInvoices].reverse().find(invoice => {
            const status = String(invoice.estado || "").toLowerCase();
            const periodStart = datePart(invoice.periodo_inicio);
            const periodEnd = datePart(invoice.periodo_fin);
            return Number(invoice.total || 0) > 0
              && !["cancelada", "cancelado", "cancelled", "canceled"].includes(status)
              && Boolean(periodStart && periodEnd)
              && (!trialEndDate || periodEnd > trialEndDate);
          });
          const paidLocalInvoices = companyLocalInvoices.filter(invoice => invoice.estado === "pagada");
          const localManualOutstandingInvoices = companyLocalInvoices.filter(invoice => {
            const status = String(invoice.estado || "").toLowerCase();
            return !invoice.stripe_invoice_id
              && Number(invoice.total || 0) > 0
              && !["pagada", "cancelada", "cancelado", "cancelled", "canceled"].includes(status);
          });
          const localByStripeId = new Map(companyLocalInvoices
            .filter(invoice => invoice.stripe_invoice_id)
            .map(invoice => [invoice.stripe_invoice_id, invoice]));

          const stripePaidWithoutLocal = paidStripeInvoices.filter(invoice => {
            const local = localByStripeId.get(invoice.id);
            return !local || local.estado !== "pagada";
          }).length;
          const localPaidButStripeUnpaid = paidLocalInvoices.filter(invoice => {
            if (!invoice.stripe_invoice_id) return false;
            const stripeInvoice = stripeInvoicesById.get(invoice.stripe_invoice_id);
            if (!stripeInvoice) return false;
            const remaining = typeof stripeInvoice.amount_remaining === "number"
              ? stripeInvoice.amount_remaining
              : Number(stripeInvoice.amount_due || 0) - Number(stripeInvoice.amount_paid || 0);
            return remaining > 0 || stripeInvoice.status !== "paid";
          }).length;

          const activeStripeCount = stripeCandidates.filter(s => ["active", "trialing", "past_due"].includes(s.status)).length;
          const stripePeriodStart = (stripeSub as any)?.current_period_start
            ?? (stripeSub as any)?.items?.data?.[0]?.current_period_start;
          const stripePeriodEnd = (stripeSub as any)?.current_period_end
            ?? (stripeSub as any)?.items?.data?.[0]?.current_period_end;

          return {
            empresa_id: empresa.id,
            empresa_nombre: empresa.nombre,
            empresa_email: empresa.email || null,
            empresa_created_at: empresa.created_at,
            empresa_demo_expires_at: empresa.demo_expires_at || null,
            is_partner_sandbox: empresa.is_partner_sandbox === true,
            active_user_count: activeUsers,
            minimum_billable_users: minimumUsers,
            expected_billable_users: expectedBillableUsers,
            db_subscription_count: dbRows.length,
            db_subscription: dbSub ? {
              id: dbSub.id,
              created_at: dbSub.created_at || null,
              status: dbSub.status,
              trial_ends_at: dbSub.trial_ends_at,
              current_period_start: dbSub.current_period_start,
              current_period_end: dbSub.current_period_end,
              fecha_vencimiento: dbSub.fecha_vencimiento,
              acceso_bloqueado: dbSub.acceso_bloqueado === true,
              es_manual: dbSub.es_manual === true,
              cancel_at_period_end: dbSub.cancel_at_period_end === true,
              stripe_customer_id: dbSub.stripe_customer_id,
              stripe_subscription_id: dbSub.stripe_subscription_id,
              stripe_payment_method_id: dbSub.stripe_payment_method_id,
              stripe_sync_error: dbSub.stripe_sync_error || null,
              max_usuarios: Number(dbSub.max_usuarios || 0),
              plan_nombre: planInfo?.nombre || null,
            } : null,
            stripe_subscription_count: activeStripeCount,
            stripe_subscription: stripeSub ? {
              id: stripeSub.id,
              created_at: stripeTimestamp(stripeSub.created),
              customer_id: getCustomerId(stripeSub.customer),
              status: stripeSub.status,
              trial_end: stripeTimestamp(stripeSub.trial_end),
              current_period_start: stripeTimestamp(stripePeriodStart),
              current_period_end: stripeTimestamp(stripePeriodEnd),
              cancel_at_period_end: stripeSub.cancel_at_period_end === true,
              quantity: billedUsers,
              payment_method_id: payment.payment_method_id,
              card: payment.card,
            } : null,
            payments: {
              stripe_paid_count: paidStripeInvoices.length,
              local_paid_count: paidLocalInvoices.length,
              stripe_paid_without_local_count: stripePaidWithoutLocal,
              local_paid_but_stripe_unpaid_count: localPaidButStripeUnpaid,
              stripe_outstanding_count: outstandingStripeInvoices.length,
              stripe_outstanding_amount: outstandingStripeInvoices.reduce((sum, invoice) => {
                const remaining = typeof invoice.amount_remaining === "number"
                  ? invoice.amount_remaining
                  : Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0);
                return sum + Math.max(0, remaining) / 100;
              }, 0),
              local_manual_outstanding_count: localManualOutstandingInvoices.length,
              local_manual_outstanding_amount: localManualOutstandingInvoices.reduce(
                (sum, invoice) => sum + Number(invoice.total || 0),
                0,
              ),
              latest_stripe_invoice: compactStripeInvoice(stripeInvoices[0]),
              latest_stripe_paid_invoice: compactStripeInvoice(paidStripeInvoices[0]),
              latest_local_invoice: compactLocalInvoice(companyLocalInvoices[0]),
              latest_local_paid_invoice: compactLocalInvoice(paidLocalInvoices[0]),
              // Excluye la factura inicial del trial; aquí solo se audita el primer ciclo cobrable.
              first_local_invoice: compactLocalInvoice(firstBillableLocalInvoice),
            },
            last_sale: latestSaleRes.data ? {
              id: latestSaleRes.data.id,
              folio: latestSaleRes.data.folio || null,
              created_at: latestSaleRes.data.created_at,
              fecha: latestSaleRes.data.fecha,
              total: Number(latestSaleRes.data.total || 0),
              status: latestSaleRes.data.status,
            } : null,
          };
        }));
        records.push(...batchRecords);
      }

      const orphanStripeSubscriptions = relevantStripeSubscriptions
        .filter(s => !claimedStripeIds.has(s.id) && ["active", "trialing", "past_due"].includes(s.status))
        .map(s => ({
          id: s.id,
          status: s.status,
          customer_id: getCustomerId(s.customer),
          customer_email: typeof s.customer === "object" ? s.customer?.email || null : null,
          created_at: stripeTimestamp(s.created),
        }));

      return new Response(JSON.stringify({
        generated_at: new Date().toISOString(),
        records,
        orphan_stripe_subscriptions: orphanStripeSubscriptions,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "dashboard_stats") {
      // Paginate all invoices (Stripe limit 100 per page)
      const allInvoices: any[] = [];
      let startingAfter: string | undefined;
      for (let i = 0; i < 20; i++) {
        const params: any = { limit: 100, expand: ["data.lines.data.price"] };
        if (startingAfter) params.starting_after = startingAfter;
        const page = await stripe.invoices.list(params);
        allInvoices.push(...page.data);
        if (!page.has_more) break;
        startingAfter = page.data[page.data.length - 1]?.id;
      }

      const [balance, subsList] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.subscriptions.list({ limit: 100, status: "all" }),
      ]);

      // Same loose Rutapp criteria as list_all_invoices: text/product match OR DB link
      const rutappInvoices = allInvoices.filter((inv) => {
        if (inv?.metadata?.empresa_id) return true;
        const lineDesc = (inv.lines?.data || [])
          .map((l: any) => `${l?.description || ''} ${l?.price?.product?.name || ''} ${l?.plan?.nickname || ''}`)
          .join(' ').toLowerCase();
        if (lineDesc.includes('rutapp') || lineDesc.includes('rut app')) return true;
        const hasProd = (inv.lines?.data || []).some((l: any) => {
          const pid = getProductId(l?.price?.product);
          return pid ? RUTAPP_PRODUCT_IDS.has(pid) : false;
        });
        return hasProd;
      });
      const rutappSubs = subsList.data.filter(isRutappSubscription);

      const mxnBalance = balance.available.find((b) => b.currency === "mxn")?.amount || 0;
      const pendingMxn = balance.pending.find((b) => b.currency === "mxn")?.amount || 0;

      // Truly paid: amount_remaining === 0 AND amount_paid > 0 (real $0 balance)
      const trulyPaidInvs = rutappInvoices.filter((i) => {
        const remaining = typeof i.amount_remaining === 'number' ? i.amount_remaining : (i.amount_due - (i.amount_paid || 0));
        return remaining === 0 && (i.amount_paid || 0) > 0;
      });

      const totalInvoiced = rutappInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);
      const totalPaid = trulyPaidInvs.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
      const paidCount = trulyPaidInvs.length;
      const totalOpen = rutappInvoices
        .filter((i) => {
          const remaining = typeof i.amount_remaining === 'number' ? i.amount_remaining : (i.amount_due - (i.amount_paid || 0));
          return remaining > 0 && i.status !== 'void' && i.status !== 'uncollectible' && i.status !== 'draft';
        })
        .reduce((sum, inv) => sum + (typeof inv.amount_remaining === 'number' ? inv.amount_remaining : inv.amount_due), 0);
      const openCount = rutappInvoices.filter((i) => {
        const remaining = typeof i.amount_remaining === 'number' ? i.amount_remaining : (i.amount_due - (i.amount_paid || 0));
        return remaining > 0 && i.status !== 'void' && i.status !== 'uncollectible' && i.status !== 'draft';
      }).length;

      const activeSubs = rutappSubs.filter(
        (s) => s.status === "active" || s.status === "trialing"
      ).length;

      const mrr = rutappSubs
        .filter((s) => s.status === "active")
        .reduce((sum, s) => {
          const rutappItemsTotal = s.items.data.reduce((itemSum, item) => {
            const productId = getProductId(item.price?.product);
            if (!productId || !RUTAPP_PRODUCT_IDS.has(productId)) return itemSum;
            return itemSum + (item.price?.unit_amount || 0) * (item.quantity || 1);
          }, 0);
          return sum + rutappItemsTotal;
        }, 0);

      const customerIds = new Set<string>();
      rutappSubs.forEach((sub) => {
        const customerId = getCustomerId(sub.customer);
        if (customerId) customerIds.add(customerId);
      });
      rutappInvoices.forEach((inv) => {
        const customerId = getCustomerId(inv.customer);
        if (customerId) customerIds.add(customerId);
      });

      return new Response(
        JSON.stringify({
          balance_available: mxnBalance,
          balance_pending: pendingMxn,
          total_invoiced: totalInvoiced,
          total_paid: totalPaid,
          paid_count: paidCount,
          total_open: totalOpen,
          open_count: openCount,
          active_subscriptions: activeSubs,
          total_customers: customerIds.size,
          mrr,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Create invoice manually (legacy) ───
    if (action === "create_invoice") {
      const { email, amount, description, days_until_due } = body;
      if (!email || !amount) throw new Error("email y amount requeridos");

      const customers = await stripe.customers.list({ email, limit: 1 });
      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const c = await stripe.customers.create({ email });
        customerId = c.id;
      }

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: days_until_due || 1,
        auto_advance: true,
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount,
        currency: "mxn",
        description: description || "Suscripción Rutapp",
      });

      const finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.sendInvoice(invoice.id);

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: finalizedInv.hosted_invoice_url,
        status: finalizedInv.status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── One-time additional charge ───
    // Creates and attempts to collect a standalone Stripe invoice. It is linked
    // to the company for reporting, but NEVER changes subscription dates, plan,
    // seats, status or access.
    if (action === "create_additional_charge") {
      const {
        empresa_id,
        cantidad = 1,
        precio_unitario,
        descuento_pct,
        concepto,
        periodo_inicio: periodoInicioInput,
        periodo_fin: periodoFinInput,
        days_until_due,
        request_id,
      } = body;

      const cantidadFinal = Math.max(1, Number(cantidad) || 1);
      const precioFinal = Number(precio_unitario);
      const descPct = Math.min(100, Math.max(0, Number(descuento_pct) || 0));
      if (!empresa_id) throw new Error("empresa_id requerido");
      if (!Number.isFinite(precioFinal) || precioFinal <= 0) throw new Error("precio_unitario requerido");

      const { data: empData } = await supabase
        .from("empresas")
        .select("id, nombre, email, telefono, rfc, owner_user_id")
        .eq("id", empresa_id)
        .maybeSingle();
      if (!empData) throw new Error("Empresa no encontrada");

      let clientEmail = empData.email;
      if (!clientEmail && empData.owner_user_id) {
        const { data: userData } = await supabase.auth.admin.getUserById(empData.owner_user_id);
        clientEmail = userData?.user?.email || null;
      }
      if (!clientEmail) throw new Error("No se encontró email para esta empresa");

      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("id, stripe_customer_id, stripe_payment_method_id")
        .eq("empresa_id", empresa_id)
        .maybeSingle();

      let customerId = subRow?.stripe_customer_id || null;
      if (!customerId) {
        const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
        customerId = customers.data[0]?.id || null;
      }
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: clientEmail,
          name: empData.nombre,
          phone: empData.telefono || undefined,
          metadata: { empresa_id, rfc: empData.rfc || "" },
        });
        customerId = customer.id;
      }

      const subtotal = cantidadFinal * precioFinal;
      const descMonto = subtotal * (descPct / 100);
      const total = subtotal - descMonto;
      if (total <= 0) throw new Error("El total del cargo debe ser mayor a cero");

      const hoy = new Date();
      const periodoInicio = periodoInicioInput ? datePart(periodoInicioInput) : datePart(hoy);
      const periodoFin = periodoFinInput ? datePart(periodoFinInput) : periodoInicio;
      const conceptoFinal = String(concepto || "Cargo adicional Rutapp").trim();
      const vencimiento = new Date(hoy);
      vencimiento.setDate(vencimiento.getDate() + (Number(days_until_due) || 7));
      const requestId = String(request_id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
      const idempotencyBase = `rutapp-additional-${empresa_id}-${requestId}`;

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        auto_advance: true,
        description: conceptoFinal,
        default_payment_method: subRow?.stripe_payment_method_id || undefined,
        metadata: {
          empresa_id,
          tipo: "additional_charge",
          affects_subscription: "0",
          cantidad: String(cantidadFinal),
          precio_unitario: String(precioFinal),
          descuento_pct: String(descPct),
          periodo_inicio: periodoInicio,
          periodo_fin: periodoFin,
          request_id: requestId,
        },
      }, { idempotencyKey: `${idempotencyBase}-invoice` });

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(subtotal * 100),
        currency: "mxn",
        description: `${conceptoFinal}: ${cantidadFinal} × $${precioFinal.toFixed(2)}`,
      }, { idempotencyKey: `${idempotencyBase}-item` });

      if (descMonto > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount: -Math.round(descMonto * 100),
          currency: "mxn",
          description: `Descuento ${descPct}%`,
        }, { idempotencyKey: `${idempotencyBase}-discount` });
      }

      // Register the draft before finalizing it. A paid webhook can therefore
      // update this same row and cannot create a duplicate during the request.
      const { data: existingFactura } = await supabase
        .from("facturas")
        .select("id")
        .eq("stripe_invoice_id", invoice.id)
        .maybeSingle();
      let facturaId = existingFactura?.id || null;
      if (!facturaId) {
        const { data: facturaRow, error: facturaErr } = await supabase
          .from("facturas")
          .insert({
            empresa_id,
            suscripcion_id: subRow?.id || null,
            concepto: conceptoFinal,
            periodo_inicio: periodoInicio,
            periodo_fin: periodoFin,
            num_usuarios: cantidadFinal,
            precio_unitario: precioFinal,
            descuento_porcentaje: descPct,
            subtotal,
            total,
            estado: "pendiente",
            tipo: "additional_charge",
            es_prorrateo: false,
            fecha_vencimiento: vencimiento.toISOString(),
            stripe_invoice_id: invoice.id,
          })
          .select("id")
          .single();
        if (facturaErr) throw facturaErr;
        facturaId = facturaRow?.id || null;
      }

      let finalizedInv = await stripe.invoices.retrieve(invoice.id);
      if (finalizedInv.status === "draft") {
        finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);
      }
      try {
        if (finalizedInv.status === "open") finalizedInv = await stripe.invoices.pay(invoice.id);
      } catch (_) {
        finalizedInv = await stripe.invoices.retrieve(invoice.id);
      }

      if (facturaId) {
        const { error: facturaUpdateErr } = await supabase
          .from("facturas")
          .update({
            numero_factura: finalizedInv.number || undefined,
            estado: finalizedInv.status === "paid" ? "pagada" : "pendiente",
            fecha_pago: finalizedInv.status === "paid" ? new Date().toISOString() : null,
            stripe_payment_intent_id: typeof (finalizedInv as any).payment_intent === "string"
              ? (finalizedInv as any).payment_intent
              : null,
          })
          .eq("id", facturaId);
        if (facturaUpdateErr) throw facturaUpdateErr;
      }

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: finalizedInv.hosted_invoice_url,
        status: finalizedInv.status,
        folio: finalizedInv.number || finalizedInv.id.slice(-8),
        total,
        factura_id: facturaId,
        stripe: true,
        tipo: "additional_charge",
        subscription_unchanged: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Create subscription invoice (N months, optional discount) ───
    // On payment, the stripe-webhook reads metadata.meses and extends current_period_end.
    if (action === "create_subscription_invoice") {
      const {
        empresa_id,
        plan_id,
        num_usuarios,
        meses,
        precio_por_usuario_mes,
        descuento_pct,
        descuento_permanente,
        crear_con_stripe = true,
        days_until_due,
        concepto,
        plan_nombre,
        periodo_inicio: periodoInicioInput,
        periodo_fin: periodoFinInput,
      } = body;

      if (!empresa_id) throw new Error("empresa_id requerido");
      if (!num_usuarios || num_usuarios < 1) throw new Error("num_usuarios requerido");
      if (!meses || meses < 1) throw new Error("meses requerido");
      if (!precio_por_usuario_mes || precio_por_usuario_mes <= 0) throw new Error("precio requerido");

      // Get empresa info
      const { data: empData } = await supabase
        .from("empresas")
        .select("id, nombre, email, telefono, rfc, owner_user_id")
        .eq("id", empresa_id)
        .maybeSingle();
      if (!empData) throw new Error("Empresa no encontrada");

      let clientEmail = empData.email;
      if (!clientEmail && empData.owner_user_id) {
        const { data: u } = await supabase.auth.admin.getUserById(empData.owner_user_id);
        clientEmail = u?.user?.email || null;
      }
      if (crear_con_stripe !== false && !clientEmail) throw new Error("No se encontró email para esta empresa");

      const subtotal = Number(num_usuarios) * Number(meses) * Number(precio_por_usuario_mes);
      const descPct = Number(descuento_pct) || 0;
      const descMonto = subtotal * (descPct / 100);
      const total = subtotal - descMonto;
      const labelPlan = plan_nombre || (meses === 1 ? "Mensual" : meses === 6 ? "Semestral" : meses === 12 ? "Anual" : `${meses} meses`);
      const conceptoFinal = concepto || `Suscripción Rutapp ${labelPlan} — ${num_usuarios} usuario${num_usuarios > 1 ? "s" : ""} × ${meses} mes${meses > 1 ? "es" : ""}`;
      const hoy = new Date();
      const periodoInicio = periodoInicioInput ? datePart(periodoInicioInput) : datePart(hoy);
      const periodoFin = periodoFinInput ? datePart(periodoFinInput) : addMonthsDatePart(periodoInicio, Number(meses));
      const vencimiento = new Date(hoy);
      vencimiento.setDate(vencimiento.getDate() + (days_until_due || 7));

      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("empresa_id", empresa_id)
        .maybeSingle();

      if (crear_con_stripe === false) {
        const folioManual = `RUT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const { data: facturaRow, error: facturaErr } = await supabase
          .from("facturas")
          .insert({
            empresa_id,
            suscripcion_id: subRow?.id || null,
            numero_factura: folioManual,
            concepto: conceptoFinal,
            periodo_inicio: periodoInicio,
            periodo_fin: periodoFin,
            num_usuarios: Number(num_usuarios),
            precio_unitario: Number(precio_por_usuario_mes),
            descuento_porcentaje: descPct,
            subtotal,
            total,
            estado: "pendiente",
            tipo: "subscription_renewal",
            es_prorrateo: false,
            fecha_vencimiento: vencimiento.toISOString(),
            stripe_invoice_id: null,
          })
          .select()
          .single();
        if (facturaErr) throw facturaErr;

        return new Response(JSON.stringify({
          stripe: false,
          folio: facturaRow?.numero_factura,
          total,
          meses,
          factura_id: facturaRow?.id,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find or create Stripe customer
      const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const c = await stripe.customers.create({
          email: clientEmail,
          name: empData.nombre,
          phone: empData.telefono || undefined,
          metadata: { empresa_id, rfc: empData.rfc || "" },
        });
        customerId = c.id;
      }

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        auto_advance: true,
        description: conceptoFinal,
        metadata: {
          empresa_id,
          tipo: "subscription_renewal",
          meses: String(meses),
          num_usuarios: String(num_usuarios),
          plan_nombre: labelPlan,
          plan_id: plan_id || "",
          descuento_pct: String(descPct),
          descuento_permanente: descuento_permanente ? "1" : "0",
        },
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(subtotal * 100),
        currency: "mxn",
        description: `${labelPlan}: ${num_usuarios} usuario${num_usuarios > 1 ? "s" : ""} × ${meses} mes${meses > 1 ? "es" : ""} × $${precio_por_usuario_mes}/usuario/mes`,
      });

      if (descMonto > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount: -Math.round(descMonto * 100),
          currency: "mxn",
          description: `Descuento ${descPct}%`,
        });
      }

      let finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);
      try {
        if (finalizedInv.status === "open") finalizedInv = await stripe.invoices.pay(invoice.id);
      } catch (_) {
        finalizedInv = await stripe.invoices.retrieve(invoice.id);
      }

      // Insert row in `facturas` so it appears in the client's "Mi Suscripción" page
      const { data: facturaRow, error: facturaErr } = await supabase
        .from("facturas")
        .insert({
          empresa_id,
          suscripcion_id: subRow?.id || null,
          numero_factura: finalizedInv.number || null,
          concepto: conceptoFinal,
          periodo_inicio: periodoInicio,
          periodo_fin: periodoFin,
          num_usuarios: Number(num_usuarios),
          precio_unitario: Number(precio_por_usuario_mes),
          descuento_porcentaje: descPct,
          subtotal,
          total,
          estado: finalizedInv.status === "paid" ? "pagada" : "pendiente",
          tipo: "subscription_renewal",
          es_prorrateo: false,
          fecha_pago: finalizedInv.status === "paid" ? new Date().toISOString() : null,
          fecha_vencimiento: vencimiento.toISOString(),
          stripe_invoice_id: finalizedInv.id,
        })
        .select()
        .single();
      if (facturaErr) console.error("[admin-billing] insert factura error:", facturaErr);

      if (finalizedInv.status === "paid" && subRow?.id) {
        await supabase.from("subscriptions").update({
          current_period_start: periodoInicio,
          current_period_end: periodoFin,
          status: "active",
          acceso_bloqueado: false,
          updated_at: new Date().toISOString(),
        }).eq("id", subRow.id);
      }

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: finalizedInv.hosted_invoice_url,
        status: finalizedInv.status,
        folio: finalizedInv.number || finalizedInv.id.slice(-8),
        total,
        meses,
        factura_id: facturaRow?.id,
        stripe: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Mark an internal invoice as paid (out of band: transferencia, efectivo, etc.) ───
    if (action === "mark_invoice_paid_out_of_band") {
      const {
        factura_id,
        empresa_id,
        metodo_pago,
        referencia_pago,
        fecha_pago,
        reflect_in_stripe,
        extender_periodo,
      } = body;

      if (!factura_id) throw new Error("factura_id requerido");
      if (!metodo_pago) throw new Error("metodo_pago requerido");

      const { data: fac, error: facErr } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .maybeSingle();
      if (facErr || !fac) throw new Error("Factura no encontrada");

      const paidAt = fecha_pago ? new Date(fecha_pago) : new Date();

      // Reflect in Stripe (paid out of band) if requested and possible
      let stripePaid = false;
      if (reflect_in_stripe && fac.stripe_invoice_id) {
        try {
          // Stripe API needs invoice in 'open' status to mark as paid out of band
          const inv = await stripe.invoices.retrieve(fac.stripe_invoice_id);
          if (inv.status === "open" || inv.status === "draft") {
            if (inv.status === "draft") {
              await stripe.invoices.finalizeInvoice(fac.stripe_invoice_id);
            }
            await stripe.invoices.pay(fac.stripe_invoice_id, { paid_out_of_band: true });
            stripePaid = true;
          } else if (inv.status === "paid") {
            stripePaid = true;
          }
        } catch (e) {
          console.error("[mark_invoice_paid_out_of_band] stripe pay error:", e);
          // don't fail the whole request; we still mark local as paid
        }
      }

      // Update factura local
      await supabase
        .from("facturas")
        .update({
          estado: "pagada",
          fecha_pago: paidAt.toISOString(),
          metodo_pago,
          referencia_pago: referencia_pago || null,
        })
        .eq("id", factura_id);

      // Extend subscription period if requested and not a prorrateo
      let nuevoFinPeriodo: string | null = null;
      if (extender_periodo && !fac.es_prorrateo && fac.tipo !== "additional_charge" && empresa_id) {
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("id, current_period_end, current_period_start")
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        if (subRow) {
          // Use the invoice's periodo_fin directly as the new subscription end date
          let nuevoFin: Date;
          if (fac.periodo_fin) {
            nuevoFin = parseCalendarDate(fac.periodo_fin);
          } else {
            // Fallback: extend 1 month from current end or today
            const base = subRow.current_period_end && new Date(subRow.current_period_end) > new Date()
              ? new Date(subRow.current_period_end)
              : new Date();
            nuevoFin = new Date(base);
            nuevoFin.setMonth(nuevoFin.getMonth() + 1);
          }
          nuevoFinPeriodo = nuevoFin.toISOString();

          const updatePayload: any = {
            current_period_end: nuevoFinPeriodo,
            status: "active",
            acceso_bloqueado: false,
            updated_at: new Date().toISOString(),
          };
          // Set period_start from the invoice if available, or today if missing
          if (fac.periodo_inicio) {
            updatePayload.current_period_start = datePart(fac.periodo_inicio);
          } else if (!subRow.current_period_start) {
            updatePayload.current_period_start = new Date().toISOString();
          }
          await supabase.from("subscriptions").update(updatePayload).eq("id", subRow.id);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        stripe_paid: stripePaid,
        nuevo_fin_periodo: nuevoFinPeriodo,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Create professional invoice with empresa, plan, users ───
    if (action === "create_pro_invoice") {
      const {
        empresa_id, empresa_nombre, empresa_email, empresa_telefono, empresa_rfc,
        items, concepto, days_until_due, plan_nombre, num_usuarios, timbres,
        descuento_plan_pct, descuento_extra_pct, total_centavos, mensaje_personal,
        enviar_email, enviar_whatsapp, telefono_envio, correo_envio,
      } = body;

      if (!empresa_id) throw new Error("empresa_id requerido");

      // Get empresa profile email from profiles
      let clientEmail = empresa_email;
      if (!clientEmail) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("empresa_id", empresa_id)
          .limit(1)
          .maybeSingle();
        if (profileData) {
          const { data: userData } = await supabase.auth.admin.getUserById(profileData.user_id);
          clientEmail = userData?.user?.email || null;
        }
      }
      if (!clientEmail) throw new Error("No se encontró email para esta empresa");

      // Find or create Stripe customer
      const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const c = await stripe.customers.create({
          email: clientEmail,
          name: empresa_nombre,
          phone: empresa_telefono || undefined,
          metadata: { empresa_id, rfc: empresa_rfc || "" },
        });
        customerId = c.id;
      }

      // Create invoice in Stripe
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: days_until_due || 3,
        auto_advance: true,
        metadata: { empresa_id, plan: plan_nombre, usuarios: String(num_usuarios) },
      });

      // Add line items
      for (const item of (items || [])) {
        if (item.amount === 0) continue;
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          amount: item.amount,
          currency: "mxn",
          description: item.description,
        });
      }

      const finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);

      // Auto-credit timbres if included in invoice
      if (timbres && timbres > 0) {
        await supabase.rpc("add_timbres", {
          p_empresa_id: empresa_id,
          p_cantidad: timbres,
          p_user_id: userData.user.id,
          p_notas: `Factura ${finalizedInv.number || finalizedInv.id.slice(-8)} — ${timbres} timbres`,
        });
      }

      // Build professional email HTML
      const primaryColor = "#6461E8";
      const folio = finalizedInv.number || finalizedInv.id.slice(-8).toUpperCase();
      const fechaLarga = new Date().toLocaleDateString("es-MX", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      const totalFmt = `$${(total_centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`;
      const vigencia = days_until_due || 3;
      const payUrl = finalizedInv.hosted_invoice_url || "";

      function adjustColor(hex: string, amount: number) {
        const num = parseInt(hex.replace("#", ""), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
      }

      const itemsHtml = (items || [])
        .filter((i: any) => i.amount !== 0)
        .map((i: any) => {
          const isNeg = i.amount < 0;
          const amt = Math.abs(i.amount / 100);
          return `<tr>
            <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${i.description}</td>
            <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;color:${isNeg ? '#16a34a' : '#333'};font-weight:600;">
              ${isNeg ? '-' : ''}$${amt.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </td>
          </tr>`;
        }).join("");

      const emailHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Factura Rutapp</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,'Helvetica Neue',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;">

<!-- Header gradient -->
<tr><td style="background:linear-gradient(135deg,${primaryColor},${adjustColor(primaryColor, -40)});padding:32px 40px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="color:#fff;"><span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;">Rutapp</span><br><span style="font-size:12px;opacity:0.85;">Sistema de Gestión de Rutas</span></td>
<td align="right" style="color:#fff;"><span style="font-size:28px;font-weight:700;letter-spacing:1px;">FACTURA</span><br><span style="font-size:12px;opacity:0.85;">${folio}</span></td>
</tr></table>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px;">

<!-- Greeting -->
<p style="color:#888;font-size:13px;margin:0 0 4px;">Estimado(a)</p>
<p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 16px;">${empresa_nombre}</p>
<div style="height:3px;background:linear-gradient(90deg,${primaryColor},transparent);border-radius:2px;margin-bottom:24px;"></div>

<!-- Intro text -->
<p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">
Hemos generado su factura por la <strong>suscripción ${plan_nombre}</strong> de Rutapp para <strong>${num_usuarios} usuario${num_usuarios > 1 ? 's' : ''}</strong>${timbres > 0 ? ` con <strong>${timbres} timbres CFDI</strong>` : ''}.
</p>

<!-- Info cards -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td width="48%" style="background:#f8f9fc;border:1px solid #e8e8e8;border-radius:8px;padding:16px;">
<span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Folio</span><br>
<span style="font-size:18px;font-weight:700;color:${primaryColor};">${folio}</span>
</td>
<td width="4%"></td>
<td width="48%" style="background:#f8f9fc;border:1px solid #e8e8e8;border-radius:8px;padding:16px;">
<span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Fecha</span><br>
<span style="font-size:14px;font-weight:600;color:#333;">${fechaLarga}</span>
</td>
</tr></table>

<!-- Vigencia warning -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 16px;">
<span style="font-size:13px;color:#856404;">⏰ Esta factura tiene una vigencia de <strong>${vigencia} día${vigencia > 1 ? 's' : ''}</strong>. Por favor realice su pago antes del vencimiento.</span>
</td>
</tr></table>

${mensaje_personal ? `
<!-- Personal message -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td style="background:#f8f9fc;border-left:4px solid ${primaryColor};border-radius:0 8px 8px 0;padding:16px 20px;">
<span style="font-size:13px;color:#555;line-height:1.6;">${mensaje_personal}</span>
</td>
</tr></table>` : ''}

<!-- Items table -->
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:24px;">
<tr style="background:${primaryColor};">
<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Concepto</td>
<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#fff;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Monto</td>
</tr>
${itemsHtml}
</table>

<!-- Total box -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr>
<td align="right">
<table cellpadding="0" cellspacing="0" style="border:2px solid ${primaryColor};border-radius:8px;overflow:hidden;">
<tr><td style="padding:16px 32px;text-align:right;">
<span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Total a pagar</span><br>
<span style="font-size:28px;font-weight:800;color:${primaryColor};">${totalFmt}</span>
</td></tr>
</table>
</td>
</tr></table>

<!-- CTA Button -->
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="center" style="padding-bottom:32px;">
<a href="${payUrl}" target="_blank" style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
💳 Pagar ahora
</a>
</td>
</tr></table>

<!-- Atendido por -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
<td align="center" style="background:#f8f9fc;border-radius:8px;padding:16px;">
<span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Atendido por</span><br>
<span style="font-size:14px;font-weight:600;color:#333;">Diego León — Rutapp</span>
</td>
</tr></table>

<!-- PDF note -->
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="background:#e8f5e9;border-radius:8px;padding:12px 16px;">
<span style="font-size:12px;color:#2e7d32;">📎 Puede descargar su factura en PDF desde el enlace de pago.</span>
</td>
</tr></table>

</td></tr>

<!-- Footer -->
<tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8e8e8;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:12px;color:#888;line-height:1.6;">
🌐 <a href="https://rutapp.mx" style="color:${primaryColor};text-decoration:none;">rutapp.mx</a><br>
📧 soporte@rutapp.mx<br>
📱 +52 (xxx) xxx-xxxx
</td>
<td align="right" style="font-size:12px;color:#aaa;">
<strong style="color:#666;">Rutapp</strong><br>
Sistema de Gestión de Rutas<br>
© ${new Date().getFullYear()}
</td>
</tr></table>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

      // Send via channels based on frontend flags
      const sendResults: { email?: boolean; whatsapp?: boolean } = {};

      // EMAIL
      if (enviar_email !== false) {
        try {
          await stripe.invoices.sendInvoice(invoice.id);
          sendResults.email = true;
        } catch (_) { sendResults.email = false; }

        await supabase.from("billing_notifications").insert({
          customer_email: correo_envio || clientEmail,
          channel: "email",
          tipo: "factura",
          mensaje: `Factura ${folio} - ${concepto}`,
          stripe_invoice_id: finalizedInv.id,
          stripe_invoice_url: payUrl,
          monto_centavos: total_centavos,
          status: "sent",
        });
      }

      // WHATSAPP
      if (enviar_whatsapp && telefono_envio) {
        const phone = telefono_envio.replace(/[\s\-\(\)]/g, "");
        const waMsg = `📋 *Factura Rutapp — ${folio}*\n\nHola *${empresa_nombre}* 👋\n\nSe ha generado tu factura:\n\n📦 *Plan:* ${plan_nombre}\n👥 *Usuarios:* ${num_usuarios}${timbres > 0 ? `\n🔖 *Timbres:* ${timbres}` : ''}${descuento_plan_pct > 0 ? `\n💚 *Descuento plan:* ${descuento_plan_pct}%` : ''}${descuento_extra_pct > 0 ? `\n🎁 *Descuento extra:* ${descuento_extra_pct}%` : ''}\n\n💰 *Total: ${totalFmt}*\n\n💳 *Paga aquí:*\n${payUrl}\n\n⏰ Vigencia: ${vigencia} días\n\nGracias por confiar en Rutapp 🚀`;

        // Get any available WA token
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const waToken = waConfig?.api_token;
        if (waToken) {
          try {
            const waRes = await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": waToken },
              body: JSON.stringify({ action: "send-text", phone, message: waMsg }),
            });
            sendResults.whatsapp = waRes.ok;

            await supabase.from("billing_notifications").insert({
              customer_email: correo_envio || clientEmail,
              customer_phone: phone,
              channel: "whatsapp",
              tipo: "factura",
              mensaje: waMsg,
              stripe_invoice_id: finalizedInv.id,
              stripe_invoice_url: payUrl,
              monto_centavos: total_centavos,
              status: waRes.ok ? "sent" : "error",
            });
          } catch (_) { sendResults.whatsapp = false; }
        }
      }

      return new Response(JSON.stringify({
        invoice_id: finalizedInv.id,
        hosted_url: payUrl,
        status: finalizedInv.status,
        folio,
        email_sent: sendResults.email ?? false,
        whatsapp_sent: sendResults.whatsapp ?? false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Send invoice notification via WhatsApp or email ───
    if (action === "send_invoice_notification") {
      const {
        channel, customer_email, amount, hosted_url, description, invoice_id,
        phone_override, empresa_nombre, folio, fecha_vencimiento, empresa_id: empresa_id_body,
      } = body;

      let notifStatus = "sent";
      let errorDetalle: string | null = null;
      let mensaje = "";

      if (channel === "whatsapp") {
        let phone: string | null = null;
        let empresaIdForToken: string | null = empresa_id_body || null;

        if (phone_override) {
          phone = String(phone_override).replace(/[\s\-\(\)]/g, "");
        } else {
          const { data: allUsersData } = await supabase.auth.admin.listUsers();
          const matchUser = allUsersData?.users?.find((u: any) => u.email === customer_email);
          if (!matchUser) throw new Error("Usuario no encontrado con ese email");

          const { data: profile } = await supabase
            .from("profiles")
            .select("telefono, empresa_id")
            .eq("user_id", matchUser.id)
            .maybeSingle();
          if (!profile?.telefono) throw new Error("El cliente no tiene teléfono registrado");
          phone = profile.telefono.replace(/[\s\-\(\)]/g, "");
          empresaIdForToken = profile.empresa_id;
        }

        // Token: try empresa-specific, then any available, then env fallback
        let waToken: string | null = null;
        if (empresaIdForToken) {
          const { data: waConfig } = await supabase
            .from("whatsapp_config")
            .select("api_token")
            .eq("empresa_id", empresaIdForToken)
            .maybeSingle();
          waToken = waConfig?.api_token || null;
        }
        if (!waToken) {
          const { data: anyWa } = await supabase
            .from("whatsapp_config")
            .select("api_token")
            .not("api_token", "is", null)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          waToken = anyWa?.api_token || null;
        }
        if (!waToken) waToken = Deno.env.get("ADMIN_WHATSAPP_TOKEN") || null;
        if (!waToken) throw new Error("Token de WhatsApp no configurado");

        const amountFmt = `$${(amount / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`;
        const folioTxt = folio ? ` *${folio}*` : "";
        const vencTxt = fecha_vencimiento
          ? `\n⏰ *Vence:* ${new Date(fecha_vencimiento).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`
          : "";
        const nombreTxt = empresa_nombre ? ` *${empresa_nombre}*` : "";
        mensaje = `¡Hola${nombreTxt}! 👋\n\n` +
          `Te compartimos el link de pago de tu factura${folioTxt} de Rutapp.\n\n` +
          `💰 *Total:* ${amountFmt}${vencTxt}\n\n` +
          `💳 *Paga en línea de forma segura aquí:*\n${hosted_url}\n\n` +
          `Aceptamos tarjeta de crédito/débito. Una vez procesado el pago, tu cuenta se reactiva automáticamente. ✅\n\n` +
          `Cualquier duda, estamos para ayudarte.\n¡Gracias por confiar en Rutapp! 🚀`;

        try {
          const apiRes = await fetch(WHATSAPI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-token": waToken },
            body: JSON.stringify({ action: "send-text", phone, message: mensaje }),
          });
          if (!apiRes.ok) {
            notifStatus = "error";
            errorDetalle = `HTTP ${apiRes.status}`;
          }
        } catch (e: any) {
          notifStatus = "error";
          errorDetalle = e.message;
        }

        // Log notification
        await supabase.from("billing_notifications").insert({
          customer_email: customer_email || null,
          customer_phone: phone,
          channel: "whatsapp",
          tipo: "factura",
          mensaje,
          stripe_invoice_id: invoice_id || null,
          stripe_invoice_url: hosted_url || null,
          monto_centavos: amount || 0,
          status: notifStatus,
          error_detalle: errorDetalle,
        });

        if (notifStatus === "error") throw new Error(errorDetalle || "Error enviando WhatsApp");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (channel === "email") {
        if (invoice_id) {
          try {
            await stripe.invoices.sendInvoice(invoice_id);
          } catch (e: any) {
            notifStatus = "error";
            errorDetalle = e.message;
          }
        }
        mensaje = `Factura enviada por correo a ${customer_email}`;

        await supabase.from("billing_notifications").insert({
          customer_email,
          channel: "email",
          tipo: "factura",
          mensaje,
          stripe_invoice_id: invoice_id || null,
          stripe_invoice_url: hosted_url || null,
          monto_centavos: amount || 0,
          status: notifStatus,
          error_detalle: errorDetalle,
        });

        if (notifStatus === "error") throw new Error(errorDetalle || "Error enviando email");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Channel no válido");
    }

    // ─── Resend a notification ───
    if (action === "resend_notification") {
      const { channel, customer_email, customer_phone, mensaje, stripe_invoice_id, stripe_invoice_url, monto_centavos, tipo } = body;

      let notifStatus = "sent";
      let errorDetalle: string | null = null;

      if (channel === "whatsapp") {
        if (!customer_phone) throw new Error("Sin teléfono para reenviar");

        // Get whatsapp token
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("api_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const waToken = waConfig?.api_token;
        if (!waToken) throw new Error("Token de WhatsApp no configurado");

        try {
          const apiRes = await fetch(WHATSAPI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-token": waToken },
            body: JSON.stringify({ action: "send-text", phone: customer_phone, message: mensaje }),
          });
          if (!apiRes.ok) {
            notifStatus = "error";
            errorDetalle = `HTTP ${apiRes.status}`;
          }
        } catch (e: any) {
          notifStatus = "error";
          errorDetalle = e.message;
        }
      } else if (channel === "email") {
        if (stripe_invoice_id) {
          try {
            await stripe.invoices.sendInvoice(stripe_invoice_id);
          } catch (e: any) {
            notifStatus = "error";
            errorDetalle = e.message;
          }
        } else {
          notifStatus = "error";
          errorDetalle = "Sin invoice_id para reenviar por email";
        }
      }

      // Log the resend
      await supabase.from("billing_notifications").insert({
        customer_email,
        customer_phone: customer_phone || null,
        channel,
        tipo: tipo || "recordatorio",
        mensaje: mensaje || null,
        stripe_invoice_id: stripe_invoice_id || null,
        stripe_invoice_url: stripe_invoice_url || null,
        monto_centavos: monto_centavos || 0,
        status: notifStatus,
        error_detalle: errorDetalle,
      });

      if (notifStatus === "error") throw new Error(errorDetalle || "Error al reenviar");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Save WhatsApp token ───
    if (action === "save_whatsapp_token") {
      const { token: waToken } = body;
      if (!waToken) throw new Error("Token requerido");

      // Store in admin_settings table (we'll create it if needed)
      // For now, store as an env var reference via a simple approach:
      // Save to the first whatsapp_config entry or create one
      const { data: existingConfigs } = await supabase
        .from("whatsapp_config")
        .select("id, empresa_id")
        .order("created_at", { ascending: true })
        .limit(1);

      if (existingConfigs && existingConfigs.length > 0) {
        await supabase
          .from("whatsapp_config")
          .update({ api_token: waToken, activo: true })
          .eq("id", existingConfigs[0].id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Test WhatsApp ───
    if (action === "test_whatsapp") {
      const { phone } = body;
      if (!phone) throw new Error("phone requerido");

      const { data: waConfig } = await supabase
        .from("whatsapp_config")
        .select("api_token")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      const waToken = waConfig?.api_token;
      if (!waToken) throw new Error("Token de WhatsApp no configurado");

      const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
      const msg = "✅ *Prueba de Rutapp*\n\nEste es un mensaje de prueba del sistema de notificaciones de cobro de Rutapp.\n\n¡Todo funciona correctamente! 🎉";

      const apiRes = await fetch(WHATSAPI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-token": waToken },
        body: JSON.stringify({ action: "send-text", phone: cleanPhone, message: msg }),
      });
      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`Error WhatsAPI: ${errText}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Acción no válida");
  } catch (error) {
    console.error("Error admin-billing:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
