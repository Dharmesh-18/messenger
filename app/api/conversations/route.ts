import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    const body = await request.json();

    const { userId, isGroup, members, name } = body;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (isGroup && (!members || members.length < 2)) {
      return new NextResponse("Invalid Data", { status: 400 });
    }

    if (isGroup) {
      const newConversaion = await prisma.conversation.create({
        data: {
          name,
          isGroup,
          users: {
            connect: [
                { id: currentUser.id },
              ...members.map((member: { value: string }) => ({ id: member.value }))
            ],
          },
        },
        include: {
          users: true,
        },
      });

      newConversaion.users.forEach((user) => {
        if(user.email) {
          pusherServer.trigger(user.email, 'conversation:new', newConversaion);
        }
      });

      return NextResponse.json(newConversaion);
    }

    const existingConversations = await prisma.conversation.findMany({
      where: {
        OR: [
          {
            userIds: {
              equals: [currentUser.id, userId],
            },
          },
          {
            userIds: {
              equals: [userId, currentUser.id],
            },
          },
        ],
      },
    });

    const singleConversation = existingConversations[0];

    if (singleConversation) {
      return NextResponse.json(singleConversation);
    }

    const newConversaion = await prisma.conversation.create({
      data: {
        users: {
          connect: [
            {
              id: currentUser.id,
            },
            {
              id: userId,
            },
          ],
        },
      },
      include: {
        users: true
      }
    });

    newConversaion.users.map((user) => {
      if(user.email) {
        pusherServer.trigger(user.email, 'conversation:new', newConversaion);
      }
    });
    
    return NextResponse.json(newConversaion);

  } catch (error: any) {
    return new NextResponse(error, { status: 500 });
  }
}
