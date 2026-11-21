-- Initial configurable jurisdiction-level structure for Benin (BJ).
-- This seeds the hierarchy vocabulary only. It does not assert tax rules or
-- create subnational jurisdiction records; those require verified source data.

INSERT INTO public.finance_tax_jurisdiction_levels
  (country_code,level_code,label,parent_level_code,sort_order,is_required,is_active)
VALUES
  ('BJ','COUNTRY','Pays',NULL,10,true,true),
  ('BJ','DEPARTMENT','Département','COUNTRY',20,true,true),
  ('BJ','COMMUNE','Commune','DEPARTMENT',30,true,true)
ON CONFLICT (country_code,level_code) DO UPDATE SET
  label=EXCLUDED.label,
  parent_level_code=EXCLUDED.parent_level_code,
  sort_order=EXCLUDED.sort_order,
  is_required=EXCLUDED.is_required,
  is_active=EXCLUDED.is_active,
  updated_at=now();

-- The Benin country node is inserted only when the code is unused.
INSERT INTO public.finance_tax_jurisdictions
  (code,country_code,name,jurisdiction_level,parent_id,is_active)
VALUES ('BJ','BJ','Bénin','COUNTRY',NULL,true)
ON CONFLICT (code) DO NOTHING;
