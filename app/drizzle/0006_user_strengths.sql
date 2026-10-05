CREATE TABLE "user_strengths" (
	"user_id" uuid NOT NULL,
	"stream_id" text NOT NULL,
	"score" real NOT NULL,
	"confidence" real NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_strengths_user_id_stream_id_pk" PRIMARY KEY("user_id","stream_id")
);
--> statement-breakpoint
ALTER TABLE "user_strengths" ADD CONSTRAINT "user_strengths_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_strengths" ADD CONSTRAINT "user_strengths_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;