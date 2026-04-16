/**
 * Supabase Edge Function: gumroad-webhook
 *
 * Receives POST from Gumroad after a successful sale.
 * Extracts the license_key and session_id from URL params,
 * then updates the checkout_sessions table to trigger
 * Realtime notification to the desktop app.
 *
 * Deploy: supabase functions deploy gumroad-webhook
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        // Gumroad sends form-urlencoded or JSON data.
        let body: Record<string, any> = {};
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            body = await req.json();
        } else {
            const formData = await req.formData();
            formData.forEach((value, key) => {
                body[key] = value;
            });
        }

        const licenseKey = body.license_key;

        // Session ID and machine ID can come from url_params or direct fields.
        let sessionId: string | null = null;
        let machineId: string | null = null;

        const urlParamsRaw = body.url_params;
        console.log(`[gumroad-webhook] Raw url_params type: ${typeof urlParamsRaw}, value:`, urlParamsRaw);

        if (urlParamsRaw) {
            if (typeof urlParamsRaw === 'object') {
                sessionId = urlParamsRaw.session_id || null;
                machineId = urlParamsRaw.machine_id || null;
            } else {
                try {
                    const urlParams = JSON.parse(urlParamsRaw);
                    sessionId = urlParams.session_id || null;
                    machineId = urlParams.machine_id || null;
                } catch {
                    const params = new URLSearchParams(urlParamsRaw);
                    sessionId = params.get('session_id');
                    machineId = params.get('machine_id');
                }
            }
        }

        if (!sessionId || !machineId) {
            const customFieldsRaw = body.custom_fields;
            if (customFieldsRaw) {
                try {
                    const customFields = JSON.parse(customFieldsRaw);
                    if (!sessionId) sessionId = customFields.session_id || null;
                    if (!machineId) machineId = customFields.machine_id || null;
                } catch {
                    // Ignore malformed custom_fields and continue with fallbacks.
                }
            }
        }

        // Gumroad often flattens custom fields or URL params into the root body.
        if (!sessionId) sessionId = body.session_id || body.select_session_id;
        if (!machineId) machineId = body.machine_id || body.select_machine_id;

        const email = body.email;
        const isTest = body.test === 'true' || body.test === true;

        console.log(`[gumroad-webhook] Purchase received: email=${email}, test=${isTest}`);
        console.log(`[gumroad-webhook] license_key=${licenseKey}, session_id=${sessionId}`);

        if (!licenseKey) {
            console.error('[gumroad-webhook] Missing license_key');
            return new Response('Missing license_key', { status: 400 });
        }

        if (!sessionId) {
            if (machineId) {
                console.log(`[gumroad-webhook] session_id missing, attempting machine_id recovery for: ${machineId}`);
            } else {
                // Sale happened but no session_id. This can happen on direct Gumroad purchases.
                console.warn('[gumroad-webhook] No session_id or machine_id found. Direct purchase - manual activation needed.');
                return new Response(JSON.stringify({ success: true, note: 'No IDs, manual activation required' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Update the checkout session and trigger Realtime to the desktop app.
        let query = supabase
            .from('checkout_sessions')
            .update({
                status: 'completed',
                license_key: licenseKey,
                completed_at: new Date().toISOString(),
            });

        if (sessionId) {
            query = query.eq('session_id', sessionId);
        } else {
            // Recovery path if Gumroad stripped the session_id.
            query = query.eq('machine_id', machineId).eq('status', 'pending');
        }

        const { data, error } = await query.select().order('created_at', { ascending: false }).limit(1);

        if (error) {
            console.error('[gumroad-webhook] DB update failed:', error.message);
            return new Response('Database error', { status: 500 });
        }

        if (!data || data.length === 0) {
            console.warn('[gumroad-webhook] No matching session found for:', { sessionId, machineId });
            return new Response('Session not found', { status: 404 });
        }

        const finalMachineId = data[0].machine_id;
        if (finalMachineId) {
            await supabase
                .from('installations')
                .update({ has_paid_license: true })
                .eq('machine_id', finalMachineId);
        }

        console.log(`[gumroad-webhook] Completed checkout for session ${data[0].session_id}`);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('[gumroad-webhook] Unexpected error:', err);
        return new Response('Internal error', { status: 500 });
    }
});
