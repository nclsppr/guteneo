-- Use the observed Pro price in integer microUSD per recipient.
DROP TRIGGER qualified_public_email_price;
CREATE TRIGGER qualified_public_email_price BEFORE INSERT ON trusted_delivery_costs
BEGIN
  SELECT RAISE(ABORT,'public_email_price_invalid')
  WHERE (NEW.pricing_basis='public_list_price_ex_tax' AND COALESCE((
    (NEW.channel='email' AND NEW.options_json='{}' AND NEW.byte_numerator=0
      AND json_extract(NEW.rate_json,'$.pricingBasis')='public_list_price_ex_tax'
      AND json_extract(NEW.rate_json,'$.unit')='recipient'
      AND json_extract(NEW.rate_json,'$.currency')='USD'
      AND json_extract(NEW.rate_json,'$.fxBasis')='commercial_fixed_reference'
      AND json_extract(NEW.rate_json,'$.fxSource')='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
      AND json_type(NEW.rate_json,'$.usdMicrosPerMessage')='integer'
      AND json_extract(NEW.rate_json,'$.usdMicrosPerMessage')>0
      AND json_type(NEW.rate_json,'$.tariffDate')='text'
      AND json_extract(NEW.rate_json,'$.tariffDate')=date(json_extract(NEW.rate_json,'$.tariffDate'))
      AND length(json_extract(NEW.rate_json,'$.tariffDate'))=10
      AND json_extract(NEW.rate_json,'$.tariffDate')<=substr(NEW.valid_from,1,10)
      AND json_type(NEW.rate_json,'$.fxDate')='text'
      AND json_extract(NEW.rate_json,'$.fxDate')=date(json_extract(NEW.rate_json,'$.fxDate'))
      AND length(json_extract(NEW.rate_json,'$.fxDate'))=10
      AND json_extract(NEW.rate_json,'$.fxDate')<=substr(NEW.valid_from,1,10)
      AND (
        (NEW.provider='ses' AND json_extract(NEW.rate_json,'$.attachmentBasis')='no_attachments'
          AND json_extract(NEW.rate_json,'$.plan')='Essentials'
          AND json_extract(NEW.rate_json,'$.tier')='0-10000000'
          AND json_extract(NEW.rate_json,'$.tariffSource')='https://aws.amazon.com/ses/pricing/')
        OR
        (NEW.provider='resend' AND json_extract(NEW.rate_json,'$.attachmentBasis')='included_pdf'
          AND json_extract(NEW.rate_json,'$.plan')='Pro'
          AND json_extract(NEW.rate_json,'$.tier')='additional_emails'
          AND json_extract(NEW.rate_json,'$.tariffSource')='https://resend.com/pricing'
          AND json_extract(NEW.rate_json,'$.usdMicrosPerMessage')<=1000000)
      ))
    OR (NEW.channel='postal'
            AND NEW.provider='pingen'
            AND NEW.account_id=NEW.route_id
            AND NEW.base_numerator=0
            AND NEW.byte_numerator=0
            AND NEW.rate_denominator=1
            AND json_type(NEW.rate_json)='object'
            AND (SELECT count(*) FROM json_each(NEW.rate_json))=8
            AND json_extract(NEW.rate_json,'$.pricingBasis')='public_list_price_ex_tax'
            AND json_extract(NEW.rate_json,'$.method')='pingen_price_calculator'
            AND json_extract(NEW.rate_json,'$.currency')='EUR'
            AND json_extract(NEW.rate_json,'$.unit')='letter'
            AND json_extract(NEW.rate_json,'$.tariffSource')='https://api.pingen.com/documentation/swagger-docs'
            AND json_extract(NEW.rate_json,'$.taxBasis')='shipping_price_excluding_vat'
            AND json_extract(NEW.rate_json,'$.taxSource')='https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits'
            AND json_type(NEW.rate_json,'$.tariffDate')='text'
            AND length(json_extract(NEW.rate_json,'$.tariffDate'))=10
            AND json_extract(NEW.rate_json,'$.tariffDate')=date(json_extract(NEW.rate_json,'$.tariffDate'),'+0 days')
            AND json_extract(NEW.rate_json,'$.tariffDate')<=substr(NEW.valid_from,1,10)
            AND json_extract(NEW.options_json,'$.addressPosition') IN ('left','right')
            AND json_extract(NEW.options_json,'$.deliveryProduct') IN ('cheap','fast')
            AND json_extract(NEW.options_json,'$.printMode') IN ('simplex','duplex')
            AND json_extract(NEW.options_json,'$.printSpectrum') IN ('grayscale','color')
            AND NEW.options_json=json_object('addressPosition',json_extract(NEW.options_json,'$.addressPosition'),'deliveryProduct',json_extract(NEW.options_json,'$.deliveryProduct'),'printMode',json_extract(NEW.options_json,'$.printMode'),'printSpectrum',json_extract(NEW.options_json,'$.printSpectrum')))
  ),0)=0) OR (NEW.pricing_basis='qualified_final_variable_cost' AND json_type(NEW.rate_json,'$.pricingBasis') IS NOT NULL);
END;

-- A price source outage can coincide with successful account and usage checks.
CREATE TABLE resend_capacity_refresh_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES resend_send_limit_policies(account_id),
  domain_sha256 TEXT NOT NULL CHECK(length(domain_sha256)=64),
  usage_sha256 TEXT NOT NULL CHECK(length(usage_sha256)=64),
  observed_at TEXT NOT NULL,
  qualified_until TEXT NOT NULL,
  limits_json TEXT NOT NULL CHECK(json_valid(limits_json)),
  previous_policy_json TEXT NOT NULL CHECK(json_valid(previous_policy_json))
);
CREATE TRIGGER immutable_resend_capacity_refresh_evidence BEFORE UPDATE ON resend_capacity_refresh_evidence
BEGIN
  SELECT RAISE(ABORT,'immutable_resend_capacity_refresh_evidence');
END;
CREATE TRIGGER retained_resend_capacity_refresh_evidence BEFORE DELETE ON resend_capacity_refresh_evidence
BEGIN
  SELECT RAISE(ABORT,'immutable_resend_capacity_refresh_evidence');
END;
