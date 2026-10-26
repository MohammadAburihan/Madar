import json
from pathlib import Path

import frappe
from frappe.utils import cint

COMPANY = "Rehan Nursery"
DATA = Path(__file__).resolve().parents[2] / "data" / "rehan_nursery_items.json"


def execute():
	if not frappe.db.exists("Company", COMPANY):
		return

	rows = json.loads(DATA.read_text(encoding="utf-8"))
	root = _root_item_group()
	for group in sorted({row["item_group"] for row in rows}):
		if not frappe.db.exists("Item Group", group):
			frappe.get_doc(
				{"doctype": "Item Group", "item_group_name": group, "parent_item_group": root, "is_group": 0}
			).insert(ignore_permissions=True)

	uom = _stock_uom()
	price_list = _selling_price_list()
	currency = frappe.db.get_value("Company", COMPANY, "default_currency")
	items = prices = skipped = 0

	for row in rows:
		code = row["item_code"]
		if not frappe.db.exists("Item", code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": row["item_name"],
					"item_group": row["item_group"],
					"stock_uom": uom,
					"is_stock_item": 1,
					"include_item_in_manufacturing": 0,
					"is_sales_item": 1,
					"is_purchase_item": 1,
				}
			).insert(ignore_permissions=True)
			items += 1
		else:
			skipped += 1

		# A customer- or batch-specific price is not the standard price, so it does not count.
		has_price = frappe.db.exists(
			"Item Price",
			{"item_code": code, "price_list": price_list, "customer": ["is", "not set"], "batch_no": ["is", "not set"]},
		)
		if not has_price:
			frappe.get_doc(
				{
					"doctype": "Item Price",
					"item_code": code,
					"price_list": price_list,
					"price_list_rate": row["price"],
					"currency": currency,
					"uom": uom,
				}
			).insert(ignore_permissions=True)
			prices += 1

	print(f"madar_setup rehan_nursery_items: items created {items}, skipped {skipped}, prices created {prices}")


def _root_item_group():
	# Setup names the root in the site's language, so it cannot be hard-coded.
	root = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["is", "not set"]}, "name")
	if not root:
		frappe.throw("No root Item Group found")
	return root


def _stock_uom():
	if frappe.db.exists("UOM", "Nos"):
		return "Nos"
	uom = frappe.db.get_single_value("Stock Settings", "stock_uom")
	if not uom:
		frappe.throw("No stock UOM available")
	return uom


def _selling_price_list():
	name = frappe.db.get_single_value("Selling Settings", "selling_price_list")
	if name:
		return name
	if cint(frappe.db.get_value("Price List", "Standard Selling", "enabled")):
		return "Standard Selling"
	name = frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name")
	if not name:
		frappe.throw("No enabled selling Price List found")
	return name
