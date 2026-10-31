-- Materialize approved onboarding data through the Tenants persistence boundary.
-- Finance database only. Additive, transactional, and never apply to ZENOX FRET V2.
-- The registration review function remains owned by Platform Registration (M20).
-- This trigger performs the M03 handoff in the same database transaction.

CREATE OR REPLACE FUNCTION public.finance_materialize_approved_registration_tenant_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_payload jsonb;
  v_org jsonb;
  v_address jsonb;
  v_contact jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM 'APPROVED'
     AND NEW.status = 'APPROVED' THEN
    v_payload := coalesce(NEW.registration_data, '{}'::jsonb);
    v_org := coalesce(v_payload -> 'organization', '{}'::jsonb);
    v_address := coalesce(v_payload -> 'address', '{}'::jsonb);
    v_contact := coalesce(v_payload -> 'contact', '{}'::jsonb);

    -- The canonical legal name, country, currency and tenant status are already
    -- maintained by the existing registration and review functions.
    INSERT INTO public.finance_tenant_profiles (
      tenant_id, trade_name, website_url, general_email, general_phone
    )
    VALUES (
      NEW.tenant_id,
      nullif(btrim(v_org ->> 'tradeName'), ''),
      nullif(btrim(v_contact ->> 'websiteUrl'), ''),
      nullif(btrim(v_contact ->> 'businessEmail'), ''),
      nullif(btrim(v_contact ->> 'businessPhone'), '')
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      trade_name = coalesce(EXCLUDED.trade_name, public.finance_tenant_profiles.trade_name),
      website_url = coalesce(EXCLUDED.website_url, public.finance_tenant_profiles.website_url),
      general_email = coalesce(EXCLUDED.general_email, public.finance_tenant_profiles.general_email),
      general_phone = coalesce(EXCLUDED.general_phone, public.finance_tenant_profiles.general_phone),
      updated_at = now();

    IF nullif(btrim(v_address ->> 'addressLine1'), '') IS NOT NULL
       AND nullif(btrim(v_address ->> 'city'), '') IS NOT NULL
       AND upper(coalesce(v_address ->> 'countryCode', '')) ~ '^[A-Z]{2}$'
       AND NOT EXISTS (
         SELECT 1
           FROM public.finance_tenant_addresses a
          WHERE a.tenant_id = NEW.tenant_id
            AND a.address_type = coalesce(v_address ->> 'addressType', 'REGISTERED')
            AND a.status = 'ACTIVE'
       ) THEN
      INSERT INTO public.finance_tenant_addresses (
        tenant_id, address_type, label, address_line1, address_line2,
        city, region, postal_code, country_code, is_primary, valid_from
      )
      VALUES (
        NEW.tenant_id,
        CASE WHEN v_address ->> 'addressType' IN ('REGISTERED', 'BUSINESS', 'BILLING')
          THEN v_address ->> 'addressType' ELSE 'REGISTERED' END,
        'Adresse issue de l’inscription',
        btrim(v_address ->> 'addressLine1'),
        nullif(btrim(v_address ->> 'addressLine2'), ''),
        btrim(v_address ->> 'city'),
        nullif(btrim(v_address ->> 'region'), ''),
        nullif(btrim(v_address ->> 'postalCode'), ''),
        upper(v_address ->> 'countryCode'),
        true,
        current_date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_materialize_approved_registration_tenant_profile() FROM PUBLIC;

DROP TRIGGER IF EXISTS finance_registration_materialize_tenant_profile
  ON public.finance_registration_requests;

CREATE TRIGGER finance_registration_materialize_tenant_profile
AFTER UPDATE OF status ON public.finance_registration_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'APPROVED')
EXECUTE FUNCTION public.finance_materialize_approved_registration_tenant_profile();

COMMENT ON FUNCTION public.finance_materialize_approved_registration_tenant_profile() IS
  'M03 handoff: materializes approved organization profile and registered address atomically with M20 review; never changes canonical tenant identity fields.';
