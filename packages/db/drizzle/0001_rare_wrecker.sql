CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposer_agent_id" uuid,
	"action_type" text NOT NULL,
	"risk_tier" integer DEFAULT 2 NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"payload_json" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"related_entity_kind" text,
	"related_entity_id" uuid,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"samples" integer DEFAULT 0 NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"pending_promotion_tier" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid,
	"action_type" text NOT NULL,
	"success" boolean NOT NULL,
	"note" text,
	"evidence_url" text,
	"task_id" uuid,
	"demoted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "principles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"weight" numeric(8, 4) DEFAULT '1' NOT NULL,
	"enforcement" text DEFAULT 'soft' NOT NULL,
	"violation_action" text DEFAULT 'log_and_continue' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key_result_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"unit" text DEFAULT '' NOT NULL,
	"healthy_min" numeric(18, 4),
	"healthy_max" numeric(18, 4),
	"last_value" numeric(18, 4),
	"last_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tradeoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"rules_json" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "domains_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "autonomy_ceiling" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "capabilities_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "unaligned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "risk_tier" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposer_agent_id_agents_id_fk" FOREIGN KEY ("proposer_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_ledgers" ADD CONSTRAINT "autonomy_ledgers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_ledgers" ADD CONSTRAINT "autonomy_ledgers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_outcomes" ADD CONSTRAINT "autonomy_outcomes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_outcomes" ADD CONSTRAINT "autonomy_outcomes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "principles" ADD CONSTRAINT "principles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradeoffs" ADD CONSTRAINT "tradeoffs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_workspace_idx" ON "approvals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "autonomy_ledgers_agent_action_idx" ON "autonomy_ledgers" USING btree ("workspace_id","agent_id","action_type");--> statement-breakpoint
CREATE INDEX "autonomy_ledgers_workspace_idx" ON "autonomy_ledgers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "autonomy_outcomes_workspace_idx" ON "autonomy_outcomes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "autonomy_outcomes_agent_idx" ON "autonomy_outcomes" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "principles_workspace_slug_idx" ON "principles" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "principles_workspace_idx" ON "principles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_workspace_slug_idx" ON "signals" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "signals_workspace_idx" ON "signals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "signals_kr_idx" ON "signals" USING btree ("key_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tradeoffs_workspace_slug_idx" ON "tradeoffs" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "tradeoffs_workspace_idx" ON "tradeoffs" USING btree ("workspace_id");