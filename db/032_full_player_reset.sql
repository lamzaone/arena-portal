-- Permit permanent deletion only in the explicitly armed reset session owning
-- the same advisory lock as the console maintenance command. UPDATE remains immutable.
-- Run through the portal SQL migration runner (supports compound statements).

DROP TRIGGER IF EXISTS portal_token_ledger_prevent_delete;
CREATE TRIGGER portal_token_ledger_prevent_delete BEFORE DELETE ON portal_token_ledger
FOR EACH ROW
BEGIN
  IF NOT (COALESCE(@tapped_full_reset, 0) = 1 AND COALESCE(IS_USED_LOCK('tapped_reset_portal'), 0) = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_token_ledger is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS portal_inventory_item_events_prevent_delete;
CREATE TRIGGER portal_inventory_item_events_prevent_delete BEFORE DELETE ON portal_inventory_item_events
FOR EACH ROW
BEGIN
  IF NOT (COALESCE(@tapped_full_reset, 0) = 1 AND COALESCE(IS_USED_LOCK('tapped_reset_portal'), 0) = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_inventory_item_events is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS portal_economy_admin_audit_prevent_delete;
CREATE TRIGGER portal_economy_admin_audit_prevent_delete BEFORE DELETE ON portal_economy_admin_audit
FOR EACH ROW
BEGIN
  IF NOT (COALESCE(@tapped_full_reset, 0) = 1 AND COALESCE(IS_USED_LOCK('tapped_reset_portal'), 0) = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_economy_admin_audit is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS portal_identity_audit_events_prevent_delete;
CREATE TRIGGER portal_identity_audit_events_prevent_delete BEFORE DELETE ON portal_identity_audit_events
FOR EACH ROW
BEGIN
  IF NOT (COALESCE(@tapped_full_reset, 0) = 1 AND COALESCE(IS_USED_LOCK('tapped_reset_portal'), 0) = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_identity_audit_events is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS portal_vip_perk_purchases_prevent_delete;
CREATE TRIGGER portal_vip_perk_purchases_prevent_delete BEFORE DELETE ON portal_vip_perk_purchases
FOR EACH ROW
BEGIN
  IF NOT (COALESCE(@tapped_full_reset, 0) = 1 AND COALESCE(IS_USED_LOCK('tapped_reset_portal'), 0) = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_vip_perk_purchases is immutable';
  END IF;
END;

DROP TRIGGER IF EXISTS portal_vip_perk_admin_audit_prevent_delete;
CREATE TRIGGER portal_vip_perk_admin_audit_prevent_delete BEFORE DELETE ON portal_vip_perk_admin_audit
FOR EACH ROW
BEGIN
  IF NOT (COALESCE(@tapped_full_reset, 0) = 1 AND COALESCE(IS_USED_LOCK('tapped_reset_portal'), 0) = CONNECTION_ID()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_vip_perk_admin_audit is immutable';
  END IF;
END;

