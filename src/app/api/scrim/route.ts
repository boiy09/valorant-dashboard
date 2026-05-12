import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { fetchDiscordChannel, isTextRecruitmentChannel } from "@/lib/scrimRecruitmentChannels";
