import { AppiError } from "../utils/AapiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
        return { accessToken, refreshToken }
    } catch (error) {
        console.log(error)
        throw new AppiError(500, error?.message || "Something went wrong while geberating refresh and access token")
    }
}

const registerUser = asyncHandler( async(req, res) => {
    // get user ddetails from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password  and refresh token field from response
    // check for user creation
    // return res

    const { fullName, email, userName, password} = req.body

    if(
        [fullName, email, userName, password].some((field) => field?.trim() === "")
    ){
        throw new AppiError(400, "All fields are required")
    }


    const existedUser = await User.findOne({
        $or: [{ userName }, { email }]
    })

    if(existedUser){
        throw new AppiError(409, "User with email or userName is already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;

    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path 
    }
        
    if(!avatarLocalPath){
        throw new AppiError(400, "Avatar file is required")
    }
    
    
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new AppiError(400, "Avatar file is required...")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: userName.toLowerCase()
    })


    const createdUser = await User.findById(user._id).select("-password -refreshToken -__v")

    if(!createdUser){
        throw new AppiError(500, "Something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
} )

const loginUser = asyncHandler( async(req, res) => {
    // req body - data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send cookies

    const { email, userName, password } = req.body;

    // if(!email && !userName){
    //     throw new AppiError(400, "userName or email id required")
    // }

    if(!(email || !userName)){
        throw new AppiError(400, "userName or email id required")
    }

    const user = await User.findOne({
        $or: [{email}, {userName}]
    })

    if(!user){
        throw new AppiError(404, "User does not exists")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new AppiError(401, "Invalid user credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select('-password -refreshToken')

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully")
    )
})

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset:{
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new AppiError(400, "Unauthorize request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const user = await User.findById(decodedToken?._id)

        if(!user){
            throw AppiError(401, "Invalid refresh token")
        }

        if(incomingRefreshToken !== user?.refreshToken) {
            throw new AppiError(401, "Refresh token is expired or used")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)

        return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new AppiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword  =asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new AppiError(400, 'Invalid old password')
    }

    user.password = newPassword;

    await user.save({ validateBeforeSave: false })

    return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const { fullName, email } = req.body;

    if (!fullName || !email) {
        throw new AppiError(400, "All fields are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id, 
        {
             $set: {
                fullName,
                email
            }
        }, 
        { new: true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new AppiError(400, "Avatar file is missing")
    }

    //Need to manage to delete old avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new AppiError(400, "Error while uploading on avatar")
    }

    await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }
    ).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Avatar image updated successfully"))
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath){
        throw new AppiError(400, "Cover image file is missing")
    }

    //Need to manage to delete old cover_image
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new AppiError(400, "Error while uploading on cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Cover Image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const { userName } = req.params
    if(!userName?.trim()){
        throw new AppiError(400, "Username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                userName: userName?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            },
        },
        {
            $project: {
                fullName: 1,
                userName: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
            }
        }
    ])

    if(!channel?.length){
        throw new AppiError(404, "Channel does not exists")
    }

    return res.status(200).json(new ApiResponse(200, channel[0], "User channel fetched successfully"))

})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        userName: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    if(!user?.watchHistory?.length){
        throw new AppiError(404, "Watch history not found" )
    }
    return res.status(200).json(new ApiResponse(200, user[0].watchHistory, "Watch history fetchedd successfully" ))
})


export { 
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
}