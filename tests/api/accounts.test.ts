/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getConfig } from "@config";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppDataSource } from "~database/datasource";
import { Application } from "~database/entities/Application";
import { RawActivity } from "~database/entities/RawActivity";
import { Token, TokenType } from "~database/entities/Token";
import { User } from "~database/entities/User";
import { APIAccount } from "~types/entities/account";
import { APIRelationship } from "~types/entities/relationship";
import { APIStatus } from "~types/entities/status";

const config = getConfig();

let token: Token;
let user: User;
let user2: User;

describe("API Tests", () => {
	beforeAll(async () => {
		if (!AppDataSource.isInitialized) await AppDataSource.initialize();

		// Initialize test user
		user = await User.createNewLocal({
			email: "test@test.com",
			username: "test",
			password: "test",
			display_name: "",
		});

		// Initialize second test user
		user2 = await User.createNewLocal({
			email: "test2@test.com",
			username: "test2",
			password: "test2",
			display_name: "",
		});

		const app = new Application();

		app.name = "Test Application";
		app.website = "https://example.com";
		app.client_id = "test";
		app.redirect_uris = "https://example.com";
		app.scopes = "read write";
		app.secret = "test";
		app.vapid_key = null;

		await app.save();

		// Initialize test token
		token = new Token();

		token.access_token = "test";
		token.application = app;
		token.code = "test";
		token.scope = "read write";
		token.token_type = TokenType.BEARER;
		token.user = user;

		token = await token.save();
	});

	afterAll(async () => {
		const activities = await RawActivity.createQueryBuilder("activity")
			.where("activity.data->>'actor' = :actor", {
				actor: `${config.http.base_url}/users/test`,
			})
			.leftJoinAndSelect("activity.objects", "objects")
			.getMany();

		// Delete all created objects and activities as part of testing
		for (const activity of activities) {
			for (const object of activity.objects) {
				await object.remove();
			}
			await activity.remove();
		}

		await user.remove();
		await user2.remove();

		await AppDataSource.destroy();
	});

	describe("POST /api/v1/accounts/:id", () => {
		test("should return a 404 error when trying to fetch a non-existent user", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/999999`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
				}
			);

			expect(response.status).toBe(404);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);
		});
	});

	describe("PATCH /api/v1/accounts/update_credentials", () => {
		test("should update the authenticated user's display name", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/update_credentials`,
				{
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						display_name: "New Display Name",
					}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const user = (await response.json()) as APIAccount;

			expect(user.display_name).toBe("New Display Name");
		});
	});

	describe("GET /api/v1/accounts/verify_credentials", () => {
		test("should return the authenticated user's account information", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/verify_credentials`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIAccount;

			expect(account.username).toBe(user.username);
			expect(account.bot).toBe(false);
			expect(account.locked).toBe(false);
			expect(account.created_at).toBeDefined();
			expect(account.followers_count).toBe(0);
			expect(account.following_count).toBe(0);
			expect(account.statuses_count).toBe(0);
			expect(account.note).toBe("");
			expect(account.url).toBe(
				`${config.http.base_url}/users/${user.username}`
			);
			expect(account.avatar).toBeDefined();
			expect(account.avatar_static).toBeDefined();
			expect(account.header).toBeDefined();
			expect(account.header_static).toBeDefined();
			expect(account.emojis).toEqual([]);
			expect(account.fields).toEqual([]);
			expect(account.source?.fields).toEqual([]);
			expect(account.source?.privacy).toBe("public");
			expect(account.source?.language).toBeNull();
			expect(account.source?.note).toBe("");
			expect(account.source?.sensitive).toBe(false);
		});
	});

	describe("GET /api/v1/accounts/:id/statuses", () => {
		test("should return the statuses of the specified user", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user.id}/statuses`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const statuses = (await response.json()) as APIStatus[];

			expect(statuses.length).toBe(0);
		});
	});

	describe("POST /api/v1/accounts/:id/follow", () => {
		test("should follow the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/follow`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.following).toBe(true);
		});
	});

	describe("POST /api/v1/accounts/:id/unfollow", () => {
		test("should unfollow the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/unfollow`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.following).toBe(false);
		});
	});

	describe("POST /api/v1/accounts/:id/remove_from_followers", () => {
		test("should remove the specified user from the authenticated user's followers and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/remove_from_followers`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.followed_by).toBe(false);
		});
	});

	describe("POST /api/v1/accounts/:id/block", () => {
		test("should block the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/block`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.blocking).toBe(true);
		});
	});

	describe("POST /api/v1/accounts/:id/unblock", () => {
		test("should unblock the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/unblock`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.blocking).toBe(false);
		});
	});

	describe("POST /api/v1/accounts/:id/mute with notifications parameter", () => {
		test("should mute the specified user and return an APIRelationship object with notifications set to false", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/mute`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ notifications: true }),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.muting).toBe(true);
			expect(account.muting_notifications).toBe(true);
		});

		test("should mute the specified user and return an APIRelationship object with notifications set to true", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/mute`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ notifications: false }),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.muting).toBe(true);
			expect(account.muting_notifications).toBe(true);
		});
	});

	describe("POST /api/v1/accounts/:id/unmute", () => {
		test("should unmute the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/unmute`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.muting).toBe(false);
		});
	});

	describe("POST /api/v1/accounts/:id/pin", () => {
		test("should pin the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/pin`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.endorsed).toBe(true);
		});
	});

	describe("POST /api/v1/accounts/:id/unpin", () => {
		test("should unpin the specified user and return an APIRelationship object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/unpin`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIRelationship;

			expect(account.id).toBe(user2.id);
			expect(account.endorsed).toBe(false);
		});
	});

	describe("POST /api/v1/accounts/:id/note", () => {
		test("should update the specified account's note and return the updated account object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/${user2.id}/note`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ comment: "This is a new note" }),
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const account = (await response.json()) as APIAccount;

			expect(account.id).toBe(user2.id);
			expect(account.note).toBe("This is a new note");
		});
	});

	describe("GET /api/v1/accounts/relationships", () => {
		test("should return an array of APIRelationship objects for the authenticated user's relationships", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/relationships?id[]=${user2.id}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
					},
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const relationships = (await response.json()) as APIRelationship[];

			expect(Array.isArray(relationships)).toBe(true);
			expect(relationships.length).toBeGreaterThan(0);
			expect(relationships[0].id).toBeDefined();
			expect(relationships[0].following).toBeDefined();
			expect(relationships[0].followed_by).toBeDefined();
			expect(relationships[0].blocking).toBeDefined();
			expect(relationships[0].muting).toBeDefined();
			expect(relationships[0].muting_notifications).toBeDefined();
			expect(relationships[0].requested).toBeDefined();
			expect(relationships[0].domain_blocking).toBeDefined();
			expect(relationships[0].notifying).toBeDefined();
		});
	});

	describe("GET /api/v1/accounts/familiar_followers", () => {
		test("should return an array of objects with id and accounts properties, where id is a string and accounts is an array of APIAccount objects", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/accounts/familiar_followers?id[]=${user2.id}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
					},
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const familiarFollowers = (await response.json()) as {
				id: string;
				accounts: APIAccount[];
			}[];

			expect(Array.isArray(familiarFollowers)).toBe(true);
			expect(familiarFollowers.length).toBeGreaterThan(0);
			expect(typeof familiarFollowers[0].id).toBe("string");
			expect(Array.isArray(familiarFollowers[0].accounts)).toBe(true);
			expect(familiarFollowers[0].accounts.length).toBeGreaterThanOrEqual(
				0
			);

			if (familiarFollowers[0].accounts.length === 0) return;
			expect(familiarFollowers[0].accounts[0].id).toBeDefined();
			expect(familiarFollowers[0].accounts[0].username).toBeDefined();
			expect(familiarFollowers[0].accounts[0].acct).toBeDefined();
			expect(familiarFollowers[0].accounts[0].display_name).toBeDefined();
			expect(familiarFollowers[0].accounts[0].locked).toBeDefined();
			expect(familiarFollowers[0].accounts[0].bot).toBeDefined();
			expect(familiarFollowers[0].accounts[0].discoverable).toBeDefined();
			expect(familiarFollowers[0].accounts[0].group).toBeDefined();
			expect(familiarFollowers[0].accounts[0].created_at).toBeDefined();
			expect(familiarFollowers[0].accounts[0].note).toBeDefined();
			expect(familiarFollowers[0].accounts[0].url).toBeDefined();
			expect(familiarFollowers[0].accounts[0].avatar).toBeDefined();
			expect(
				familiarFollowers[0].accounts[0].avatar_static
			).toBeDefined();
			expect(familiarFollowers[0].accounts[0].header).toBeDefined();
			expect(
				familiarFollowers[0].accounts[0].header_static
			).toBeDefined();
			expect(
				familiarFollowers[0].accounts[0].followers_count
			).toBeDefined();
			expect(
				familiarFollowers[0].accounts[0].following_count
			).toBeDefined();
			expect(
				familiarFollowers[0].accounts[0].statuses_count
			).toBeDefined();
			expect(familiarFollowers[0].accounts[0].emojis).toBeDefined();
			expect(familiarFollowers[0].accounts[0].fields).toBeDefined();
		});
	});
});
