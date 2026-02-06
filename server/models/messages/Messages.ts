import { Schema , model , Types} from 'mongoose';

export type Role = 'user' | 'model';

export interface Message {
    conversationId: Types.ObjectId;
    text: String;
    role: Role;
    createdAt: Date;
}

const messageSchema = new Schema<Message>({
    conversationId:{
        type: Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true,

    },
    role:{
        type: String,
        enum: ['user', 'model'],
        required: true,
    },
    text:{
        type: String,
        required: true,
    },
}, {timestamps: true}
);

const Message = model<Message>('Message', messageSchema);

export default Message;
