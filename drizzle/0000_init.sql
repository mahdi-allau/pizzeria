CREATE TYPE "public"."ingredient_category" AS ENUM('cheese', 'cured', 'veg', 'fish', 'extra');--> statement-breakpoint
CREATE TYPE "public"."order_item_kind" AS ENUM('pizza', 'product');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'new', 'preparing', 'ready', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('drink', 'side', 'dessert');--> statement-breakpoint
CREATE TABLE "doughs" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"surcharge_cents" integer DEFAULT 0 NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"to_address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"provider_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "ingredient_category" NOT NULL,
	"price_cents" integer NOT NULL,
	"max_portions" integer DEFAULT 2 NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"vegetarian" boolean DEFAULT false NOT NULL,
	"vegan" boolean DEFAULT false NOT NULL,
	"spicy" boolean DEFAULT false NOT NULL,
	"after_bake" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ingredients_price_nonneg" CHECK ("ingredients"."price_cents" >= 0),
	CONSTRAINT "ingredients_portions" CHECK ("ingredients"."max_portions" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "menu_pizza_ingredients" (
	"pizza_slug" text NOT NULL,
	"ingredient_slug" text NOT NULL,
	"portions" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_pizza_ingredients_pizza_slug_ingredient_slug_pk" PRIMARY KEY("pizza_slug","ingredient_slug")
);
--> statement-breakpoint
CREATE TABLE "menu_pizza_prices" (
	"pizza_slug" text NOT NULL,
	"size_slug" text NOT NULL,
	"price_cents" integer NOT NULL,
	CONSTRAINT "menu_pizza_prices_pizza_slug_size_slug_pk" PRIMARY KEY("pizza_slug","size_slug"),
	CONSTRAINT "menu_price_nonneg" CHECK ("menu_pizza_prices"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_pizzas" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sauce_slug" text NOT NULL,
	"badges" text[] DEFAULT '{}'::text[] NOT NULL,
	"seed" text NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "order_item_kind" NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"config" jsonb NOT NULL,
	"layout_seed" text,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	CONSTRAINT "order_items_qty" CHECK ("order_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"public_token" text NOT NULL,
	"client_request_id" text,
	"status" "order_status" DEFAULT 'awaiting_payment' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text NOT NULL,
	"notes" text,
	"pickup_at" timestamp with time zone NOT NULL,
	"pizza_count" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"payment_provider" text NOT NULL,
	"payment_intent_id" text,
	"reservation_expires_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "orders_client_request_id_unique" UNIQUE("client_request_id"),
	CONSTRAINT "orders_payment_intent_id_unique" UNIQUE("payment_intent_id"),
	CONSTRAINT "orders_total_nonneg" CHECK ("orders"."total_cents" >= 0),
	CONSTRAINT "orders_pizza_count_nonneg" CHECK ("orders"."pizza_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"order_id" uuid,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "product_category" NOT NULL,
	"price_cents" integer NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"volume_label" text,
	"available" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sauces" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"surcharge_cents" integer DEFAULT 0 NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"hours" jsonb NOT NULL,
	"prep_minutes" integer NOT NULL,
	"slot_minutes" integer DEFAULT 15 NOT NULL,
	"slot_capacity" integer NOT NULL,
	"max_days_ahead" integer NOT NULL,
	"shop_open" boolean DEFAULT true NOT NULL,
	"closed_message" text,
	"reopen_at" timestamp with time zone,
	"closed_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notification_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sizes" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"diameter_cm" integer NOT NULL,
	"base_price_cents" integer NOT NULL,
	"topping_price_pct" integer DEFAULT 100 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_pizza_ingredients" ADD CONSTRAINT "menu_pizza_ingredients_pizza_slug_menu_pizzas_slug_fk" FOREIGN KEY ("pizza_slug") REFERENCES "public"."menu_pizzas"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "menu_pizza_ingredients" ADD CONSTRAINT "menu_pizza_ingredients_ingredient_slug_ingredients_slug_fk" FOREIGN KEY ("ingredient_slug") REFERENCES "public"."ingredients"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_pizza_prices" ADD CONSTRAINT "menu_pizza_prices_pizza_slug_menu_pizzas_slug_fk" FOREIGN KEY ("pizza_slug") REFERENCES "public"."menu_pizzas"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "menu_pizza_prices" ADD CONSTRAINT "menu_pizza_prices_size_slug_sizes_slug_fk" FOREIGN KEY ("size_slug") REFERENCES "public"."sizes"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_pizzas" ADD CONSTRAINT "menu_pizzas_sauce_slug_sauces_slug_fk" FOREIGN KEY ("sauce_slug") REFERENCES "public"."sauces"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_order_kind_uq" ON "email_log" USING btree ("order_id","kind");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_pickup_idx" ON "orders" USING btree ("pickup_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");