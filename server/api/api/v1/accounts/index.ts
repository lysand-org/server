import { getConfig } from "@config";
import { parseRequest } from "@request";
import { jsonResponse } from "@response";
import { tempmailDomains } from "@tempmail";
import { User } from "~database/entities/User";
import { applyConfig } from "@api";

export const meta = applyConfig({
	allowedMethods: ["POST"],
	route: "/api/v1/accounts",
	ratelimits: {
		max: 2,
		duration: 60,
	},
	auth: {
		required: true,
	},
});

/**
 * Creates a new user
 */
export default async (req: Request): Promise<Response> => {
	// TODO: Add Authorization check

	const body = await parseRequest<{
		username: string;
		email: string;
		password: string;
		agreement: boolean;
		locale: string;
		reason: string;
	}>(req);

	const config = getConfig();

	const errors: {
		details: Record<
			string,
			{
				error:
					| "ERR_BLANK"
					| "ERR_INVALID"
					| "ERR_TOO_LONG"
					| "ERR_TOO_SHORT"
					| "ERR_BLOCKED"
					| "ERR_TAKEN"
					| "ERR_RESERVED"
					| "ERR_ACCEPTED"
					| "ERR_INCLUSION";
				description: string;
			}[]
		>;
	} = {
		details: {
			password: [],
			username: [],
			email: [],
			agreement: [],
			locale: [],
			reason: [],
		},
	};

	// Check if fields are blank
	["username", "email", "password", "agreement", "locale", "reason"].forEach(
		value => {
			// @ts-expect-error Value is always valid
			if (!body[value])
				errors.details[value].push({
					error: "ERR_BLANK",
					description: `can't be blank`,
				});
		}
	);

	// Check if username is valid
	if (!body.username?.match(/^[a-zA-Z0-9_]+$/))
		errors.details.username.push({
			error: "ERR_INVALID",
			description: `must only contain letters, numbers, and underscores`,
		});

	// Check if username doesnt match filters
	if (
		config.filters.username_filters.some(
			filter => body.username?.match(filter)
		)
	) {
		errors.details.username.push({
			error: "ERR_INVALID",
			description: `contains blocked words`,
		});
	}

	// Check if username is too long
	if ((body.username?.length ?? 0) > config.validation.max_username_size)
		errors.details.username.push({
			error: "ERR_TOO_LONG",
			description: `is too long (maximum is ${config.validation.max_username_size} characters)`,
		});

	// Check if username is too short
	if ((body.username?.length ?? 0) < 3)
		errors.details.username.push({
			error: "ERR_TOO_SHORT",
			description: `is too short (minimum is 3 characters)`,
		});

	// Check if username is reserved
	if (config.validation.username_blacklist.includes(body.username ?? ""))
		errors.details.username.push({
			error: "ERR_RESERVED",
			description: `is reserved`,
		});

	// Check if username is taken
	if (await User.findOne({ where: { username: body.username } }))
		errors.details.username.push({
			error: "ERR_TAKEN",
			description: `is already taken`,
		});

	// Check if email is valid
	if (
		!body.email?.match(
			/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
		)
	)
		errors.details.email.push({
			error: "ERR_INVALID",
			description: `must be a valid email address`,
		});

	// Check if email is blocked
	if (
		config.validation.email_blacklist.includes(body.email ?? "") ||
		(config.validation.blacklist_tempmail &&
			tempmailDomains.domains.includes((body.email ?? "").split("@")[1]))
	)
		errors.details.email.push({
			error: "ERR_BLOCKED",
			description: `is from a blocked email provider`,
		});

	// Check if agreement is accepted
	if (!body.agreement)
		errors.details.agreement.push({
			error: "ERR_ACCEPTED",
			description: `must be accepted`,
		});

	// If any errors are present, return them
	if (Object.values(errors.details).some(value => value.length > 0)) {
		// Error is something like "Validation failed: Password can't be blank, Username must contain only letters, numbers and underscores, Agreement must be accepted"

		const errorsText = Object.entries(errors.details)
			.map(
				([name, errors]) =>
					`${name} ${errors
						.map(error => error.description)
						.join(", ")}`
			)
			.join(", ");
		return jsonResponse({
			error: `Validation failed: ${errorsText}`,
			details: errors.details,
		});
	}

	// TODO: Check if locale is valid

	await User.createNewLocal({
		username: body.username ?? "",
		password: body.password ?? "",
		email: body.email ?? "",
	});

	// TODO: Return access token
	return new Response();
};
