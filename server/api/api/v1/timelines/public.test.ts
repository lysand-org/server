import { afterAll, describe, expect, test } from "bun:test";
import { config } from "config-manager";
import {
    deleteOldTestUsers,
    getTestStatuses,
    getTestUsers,
    sendTestRequest,
} from "~tests/utils";
import type { Status as APIStatus } from "~types/mastodon/status";
import { meta } from "./public";

await deleteOldTestUsers();

const { users, tokens, deleteUsers } = await getTestUsers(5);
const timeline = (await getTestStatuses(40, users[0])).toReversed();

afterAll(async () => {
    await deleteUsers();
});

describe(meta.route, () => {
    test("should correctly parse limit", async () => {
        const response = await sendTestRequest(
            new Request(
                new URL(`${meta.route}?limit=5`, config.http.base_url),
                {
                    headers: {
                        Authorization: `Bearer ${tokens[0].accessToken}`,
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");

        const objects = (await response.json()) as APIStatus[];

        expect(objects.length).toBe(5);
    });

    test("should return 200 with statuses", async () => {
        const response = await sendTestRequest(
            new Request(new URL(meta.route, config.http.base_url), {
                headers: {
                    Authorization: `Bearer ${tokens[0].accessToken}`,
                },
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");

        const objects = (await response.json()) as APIStatus[];

        expect(objects.length).toBe(20);
        for (const [index, status] of objects.entries()) {
            expect(status.account).toBeDefined();
            expect(status.account.id).toBe(users[0].id);
            expect(status.content).toBeDefined();
            expect(status.created_at).toBeDefined();
            expect(status.id).toBe(timeline[index].id);
        }
    });

    test("should only fetch local statuses", async () => {
        const response = await sendTestRequest(
            new Request(
                new URL(
                    `${meta.route}?limit=20&local=true`,
                    config.http.base_url,
                ),
                {
                    headers: {
                        Authorization: `Bearer ${tokens[0].accessToken}`,
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");

        const objects = (await response.json()) as APIStatus[];

        expect(objects.length).toBe(20);
        for (const [index, status] of objects.entries()) {
            expect(status.account).toBeDefined();
            expect(status.account.id).toBe(users[0].id);
            expect(status.content).toBeDefined();
            expect(status.created_at).toBeDefined();
            expect(status.id).toBe(timeline[index].id);
        }
    });

    test("should only fetch remote statuses", async () => {
        const response = await sendTestRequest(
            new Request(
                new URL(
                    `${meta.route}?remote=true&allow_local_only=false&only_media=false`,
                    config.http.base_url,
                ),
                {
                    headers: {
                        Authorization: `Bearer ${tokens[0].accessToken}`,
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");

        const objects = (await response.json()) as APIStatus[];

        expect(objects).toBeArray();
    });

    describe("should paginate properly", async () => {
        test("should send correct Link header", async () => {
            const response = await sendTestRequest(
                new Request(
                    new URL(`${meta.route}?limit=20`, config.http.base_url),
                    {
                        headers: {
                            Authorization: `Bearer ${tokens[0].accessToken}`,
                        },
                    },
                ),
            );

            expect(response.headers.get("link")).toBe(
                `<${config.http.base_url}/api/v1/timelines/public?limit=20&max_id=${timeline[19].id}>; rel="next"`,
            );
        });

        test("should correct statuses with max", async () => {
            const response = await sendTestRequest(
                new Request(
                    new URL(
                        `${meta.route}?limit=20&max_id=${timeline[19].id}`,
                        config.http.base_url,
                    ),
                    {
                        headers: {
                            Authorization: `Bearer ${tokens[0].accessToken}`,
                        },
                    },
                ),
            );

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toBe(
                "application/json",
            );

            const objects = (await response.json()) as APIStatus[];

            expect(objects.length).toBe(20);
            for (const [index, status] of objects.entries()) {
                expect(status.account).toBeDefined();
                expect(status.account.id).toBe(users[0].id);
                expect(status.content).toBeDefined();
                expect(status.created_at).toBeDefined();
                expect(status.id).toBe(timeline[index + 20].id);
            }
        });

        test("should send correct Link prev header", async () => {
            const response = await sendTestRequest(
                new Request(
                    new URL(
                        `${meta.route}?limit=20&max_id=${timeline[19].id}`,
                        config.http.base_url,
                    ),
                    {
                        headers: {
                            Authorization: `Bearer ${tokens[0].accessToken}`,
                        },
                    },
                ),
            );

            expect(response.headers.get("link")).toInclude(
                `${config.http.base_url}/api/v1/timelines/public?limit=20&min_id=${timeline[20].id}>; rel="prev"`,
            );
        });

        test("should correct statuses with min_id", async () => {
            const response = await sendTestRequest(
                new Request(
                    new URL(
                        `${meta.route}?limit=20&min_id=${timeline[20].id}`,
                        config.http.base_url,
                    ),
                    {
                        headers: {
                            Authorization: `Bearer ${tokens[0].accessToken}`,
                        },
                    },
                ),
            );

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toBe(
                "application/json",
            );

            const objects = (await response.json()) as APIStatus[];

            expect(objects.length).toBe(20);
            for (const [index, status] of objects.entries()) {
                expect(status.account).toBeDefined();
                expect(status.account.id).toBe(users[0].id);
                expect(status.content).toBeDefined();
                expect(status.created_at).toBeDefined();
                expect(status.id).toBe(timeline[index].id);
            }
        });
    });
});
