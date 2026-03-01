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
    // Only accept POST
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        // Gumroad sends form-urlencoded data
        const formData = await req.formData();

        // Extract license key (always present in webhook)
        const licenseKey = formData.get('license_key') as string;

        // Session ID can come from:
        // 1. url_params field (JSON string with URL query params)
        // 2. Direct custom field named session_id
        let sessionId: string | null = null;

        // Try url_params first (our URL param approach)
        const urlParamsRaw = formData.get('url_params') as string;
        if (urlParamsRaw) {
            try {
                const urlParams = JSON.parse(urlParamsRaw);
                sessionId = urlParams.session_id || null;
            } catch {
                // Not JSON, try as query string
                const params = new URLSearchParams(urlParamsRaw);
                sessionId = params.get('session_id');
            }
        }

        // Fallback: try direct field
        if (!sessionId) {
            sessionId = formData.get('session_id') as string;
        }

        // Log all form data keys for debugging
        const allKeys: string[] = [];
        formData.forEach((_, key) => allKeys.push(key));
        console.log(`[gumroad-webhook] Keys received: ${allKeys.join(', ')}`);
        console.log(`[gumroad-webhook] license_key=${licenseKey}, session_id=${sessionId}`);

        if (!licenseKey) {
            console.error('[gumroad-webhook] Missing license_key');
            return new Response('Missing license_key', { status: 400 });
        }

        if (!sessionId) {
            // Sale happened but no session_id — maybe direct Gumroad purchase
            // Still valid, just can't auto-unlock desktop app
            console.warn('[gumroad-webhook] No session_id found. Direct purchase — manual activation needed.');
            return new Response(JSON.stringify({ success: true, note: 'No session_id, manual activation required' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Create Supabase client with service role key (bypasses RLS)
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Update the checkout session → triggers Realtime to desktop app
        const { data, error } = await supabase
            .from('checkout_sessions')
            .update({
                status: 'completed',
                license_key: licenseKey,
                completed_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .select();

        if (error) {
            console.error('[gumroad-webhook] DB update failed:', error.message);
            return new Response('Database error', { status: 500 });
        }

        if (!data || data.length === 0) {
            console.warn('[gumroad-webhook] No matching pending session:', sessionId);
            return new Response('Session not found', { status: 404 });
        }

        // Also mark the installation as paid
        const machineId = data[0].machine_id;
        if (machineId) {
            await supabase
                .from('installations')
                .update({ has_paid_license: true })
                .eq('machine_id', machineId);
        }

        console.log(`[gumroad-webhook] ✅ Checkout completed for session ${sessionId}`);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        console.error('[gumroad-webhook] Unexpected error:', err);
        return new Response('Internal error', { status: 500 });
    }
});
